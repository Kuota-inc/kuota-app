// KYC del comercio con Didit: crea la sesión de verificación, recibe la decisión
// y asigna el nivel. Nunca guarda imágenes; solo el resultado y su referencia.
//
// Niveles (ver security/limits.ts):
//   Básico   → DNI y teléfono declarados (kyc_status distinto de APPROVED)
//   Ampliado → Didit aprobó documento + prueba de vida + rostro y el DNI coincide (APPROVED)
import { db } from '../db/database.js';
import { didit, diditEnabled, type DiditCheck, type DiditDecision } from '../integrations/didit.js';

export type KycOutcome = 'APPROVED' | 'REJECTED' | 'IN_REVIEW' | 'IN_PROGRESS';

interface KycRow {
  id: string;
  session_id: string;
  public_id: string;
  status: string;
  provider: string;
  provider_session_id: string | null;
  verification_url: string | null;
  decision_status: string | null;
  decision_reason: string | null;
  decision_summary_json: string | null;
}

export const getKycByPublicId = (publicId: string) =>
  db.get<KycRow>('SELECT * FROM kyc_requests WHERE public_id = ?', publicId);

/** Inicia (o reanuda) la verificación en Didit. Devuelve la URL a la que va el usuario. */
export async function startVerification(publicId: string) {
  const kyc = await getKycByPublicId(publicId);
  if (!kyc) return null;
  if (!diditEnabled()) return { provider: 'DEMO' as const, url: null, status: kyc.status };
  if (kyc.provider_session_id && kyc.verification_url && kyc.status === 'IN_PROGRESS') {
    return { provider: 'DIDIT' as const, url: kyc.verification_url, status: kyc.status };
  }
  const merchant = await db.get<{ dni: string | null; full_name: string | null }>('SELECT dni, full_name FROM merchant_profiles WHERE session_id = ?', kyc.session_id);
  // Proveedor: el documento esperado es el del representante legal (DNI o carnet de extranjería).
  const rep = merchant
    ? undefined
    : await db.get<{ legal_rep_dni: string | null }>('SELECT legal_rep_dni FROM provider_profiles WHERE session_id = ?', kyc.session_id);
  const expectedNumber = merchant?.dni ?? rep?.legal_rep_dni ?? null;
  const session = await didit.createSession({
    vendor_data: publicId,
    callback: process.env.DIDIT_CALLBACK_URL || undefined,
    language: 'es',
    // Didit compara lo leído del documento con lo declarado.
    expected_details: { id_country: 'PER', ...(expectedNumber ? { identification_number: expectedNumber } : {}) }
  });
  await db.run(
    "UPDATE kyc_requests SET provider = 'DIDIT', provider_session_id = ?, verification_url = ?, status = 'IN_PROGRESS', updated_at = utc_now_text() WHERE id = ?",
    session.session_id,
    session.url,
    kyc.id
  );
  return { provider: 'DIDIT' as const, url: session.url, status: 'IN_PROGRESS' };
}

const first = (list: DiditCheck[] | undefined) => (Array.isArray(list) && list.length ? list[0] : undefined);
const norm = (s: unknown) => String(s ?? '').trim().toUpperCase();

function outcomeOf(status: string): KycOutcome {
  switch (norm(status)) {
    case 'APPROVED':
      return 'APPROVED';
    case 'DECLINED':
    case 'EXPIRED':
    case 'ABANDONED':
    case 'KYC EXPIRED':
      return 'REJECTED';
    case 'IN REVIEW':
      return 'IN_REVIEW';
    default:
      return 'IN_PROGRESS';
  }
}

/**
 * Aplica la decisión de Didit. Aunque Didit apruebe, si el número del documento
 * no coincide con el DNI declarado en el onboarding, se rechaza (suplantación).
 */
export async function applyDecision(sessionId: string, status: string, decision: Partial<DiditDecision> | null) {
  const kyc = await db.get<KycRow>('SELECT * FROM kyc_requests WHERE provider_session_id = ?', sessionId);
  if (!kyc) return null;
  const merchant = await db.get<{ id: string; dni: string | null }>('SELECT id, dni FROM merchant_profiles WHERE session_id = ?', kyc.session_id);
  // Proveedor: el documento esperado es el del representante legal.
  const provider = merchant
    ? undefined
    : await db.get<{ id: string; legal_rep_dni: string | null }>('SELECT id, legal_rep_dni FROM provider_profiles WHERE session_id = ?', kyc.session_id);
  // DNI o carnet de extranjería: se comparan en mayúsculas y solo letras y dígitos (un CE puede tener letras).
  const normDoc = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const expectedDoc = normDoc(merchant?.dni ?? provider?.legal_rep_dni ?? '');

  let outcome = outcomeOf(status);
  let reason: string | null = outcome === 'REJECTED' ? `DIDIT_${norm(status).replace(/\s+/g, '_')}` : null;
  const doc = first(decision?.id_verifications);
  // En el DNI el número personal y el del documento coinciden; en el carnet de extranjería Didit puede
  // devolver el número del carnet en document_number. Vale cualquiera de los dos.
  const readNumbers = [normDoc(doc?.personal_number), normDoc(doc?.document_number)].filter(Boolean);
  const docNumber = readNumbers[0] ?? '';
  const numberMatches = expectedDoc ? readNumbers.includes(expectedDoc) : null;
  if (outcome === 'APPROVED' && expectedDoc && readNumbers.length && !numberMatches) {
    outcome = 'REJECTED';
    reason = 'DNI_MISMATCH';
  }
  if (outcome === 'APPROVED' && !docNumber) {
    outcome = 'IN_REVIEW';
    reason = 'DOCUMENT_NUMBER_MISSING';
  }

  // Solo el resumen: estados y puntajes, sin imágenes ni datos biométricos.
  const summary = {
    provider_status: status,
    document: doc ? { status: doc.status, number_matches: numberMatches, document_type: doc.document_type ?? null } : null,
    liveness: first(decision?.liveness_checks) ? { status: first(decision?.liveness_checks)!.status, score: first(decision?.liveness_checks)!.score ?? null } : null,
    face_match: first(decision?.face_matches) ? { status: first(decision?.face_matches)!.status, score: first(decision?.face_matches)!.score ?? null } : null
  };

  await db.tx(async () => {
    await db.run(
      `UPDATE kyc_requests SET status = ?, decision_status = ?, decision_reason = ?, decision_summary_json = ?,
         progress_pct = ?, verified_at = CASE WHEN ? IN ('APPROVED', 'REJECTED') THEN utc_now_text() ELSE verified_at END,
         updated_at = utc_now_text() WHERE id = ?`,
      outcome,
      status,
      reason,
      JSON.stringify(summary),
      outcome === 'IN_PROGRESS' ? 50 : 100,
      outcome,
      kyc.id
    );
    if (merchant) await db.run('UPDATE merchant_profiles SET kyc_status = ?, updated_at = utc_now_text() WHERE id = ?', outcome, merchant.id);
  });
  return { publicId: kyc.public_id, outcome, reason };
}

/** Estado actual para la app (consulta Didit si el webhook aún no llegó). */
export async function refreshFromProvider(kyc: KycRow) {
  if (kyc.provider !== 'DIDIT' || !kyc.provider_session_id || kyc.status !== 'IN_PROGRESS' || !diditEnabled()) return kyc;
  try {
    const d = await didit.getDecision(kyc.provider_session_id);
    if (outcomeOf(d.status) !== 'IN_PROGRESS') await applyDecision(kyc.provider_session_id, d.status, d);
  } catch {
    /* sin conexión con Didit: se queda con el último estado conocido */
  }
  return (await getKycByPublicId(kyc.public_id))!;
}
