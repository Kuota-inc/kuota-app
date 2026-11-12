import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, Banknote, History, Loader2, MessageCircle, QrCode, ScanLine, Search, ShieldCheck, UserPlus, X } from 'lucide-react';
import { api, API_ORIGIN, apiRequest, type ContactLookup } from '../../api/client';
import type { PublicLink } from '../../api/payments';
import { Avatar } from '../../components/Avatar';

/** Contacto al que se le va a cobrar: solo viaja el celular que escribió el usuario y lo que respondió el servidor. */
export interface ChargeContact {
  phone: string;
  name: string | null;
  registered: boolean;
  verified: boolean;
  kind: ContactLookup['kind'];
}

const RECENTS_KEY = 'kuota.recent_contacts';
type Recent = ChargeContact & { at: number };

const readRecents = (): Recent[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((r) => typeof r?.phone === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
};
const saveRecent = (c: ChargeContact) => {
  try {
    const next = [{ ...c, at: Date.now() }, ...readRecents().filter((r) => r.phone !== c.phone)].slice(0, 6);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* sin almacenamiento: no se recuerdan los recientes */
  }
};

/** Celular peruano de 9 dígitos (acepta +51 y separadores) o null. */
const phone9 = (v: string): string | null => {
  const d = v.replace(/\D/g, '');
  const n = d.length === 11 && d.startsWith('51') ? d.slice(2) : d;
  return /^9\d{8}$/.test(n) ? n : null;
};

/** Código de un cobro Kuota si el QR es un link /pay/<código> de nuestro propio servidor; cualquier otro QR se rechaza. */
function payCodeOf(text: string): string | null {
  try {
    const u = new URL(text.trim());
    const m = u.pathname.match(/^\/pay\/([A-Za-z0-9_-]{6,80})$/);
    const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    if (!m || !(u.origin === API_ORIGIN || local) || (u.protocol !== 'https:' && !local)) return null;
    return m[1];
  } catch {
    return null;
  }
}

const soles = (c: number) => `S/ ${(c / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const initials = (n: string | null) => (n ?? '?').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').trim().slice(0, 2).toUpperCase() || '?';

const QrScannerModal = React.lazy(() => import('../../components/QrScannerModal').then((m) => ({ default: m.QrScannerModal })));

export const CobrosHubScreen: React.FC<{ onBack: () => void; onCharge: (contact: ChargeContact | null) => void }> = ({ onBack, onCharge }) => {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ContactLookup | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [recents, setRecents] = useState<Recent[]>(readRecents);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<{ url: string; info: PublicLink } | null>(null);
  const [scanError, setScanError] = useState('');
  const seq = useRef(0);

  const phone = phone9(query);
  const hasLetters = /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(query);

  // Validación automática: al completar los 9 dígitos se consulta si ya tiene Kuota.
  useEffect(() => {
    const mine = ++seq.current;
    if (!phone) {
      setState('idle');
      setResult(null);
      return;
    }
    setState('loading');
    const t = window.setTimeout(() => {
      api
        .lookupContact(phone)
        .then((r) => {
          if (mine !== seq.current) return;
          setResult(r);
          setState('done');
        })
        .catch((e: any) => {
          if (mine !== seq.current) return;
          setErrorMsg(e?.status === 429 ? 'Hiciste muchas consultas seguidas. Espera un minuto.' : e?.message || 'No pudimos validar el número.');
          setState('error');
        });
    }, 350);
    return () => window.clearTimeout(t);
  }, [phone]);

  const suggestions = hasLetters ? recents.filter((r) => (r.name ?? '').toLowerCase().includes(query.trim().toLowerCase())) : [];

  const charge = (c: ChargeContact) => {
    saveRecent(c);
    setRecents(readRecents());
    onCharge(c);
  };

  const handleScan = (text: string) => {
    setScanning(false);
    setScanError('');
    const code = payCodeOf(text);
    if (!code) {
      setScanError('Ese QR no es un cobro de Kuota. Por tu seguridad no lo abrimos.');
      return;
    }
    apiRequest<PublicLink>(`/payment-links/public/${encodeURIComponent(code)}`)
      .then((info) => setScanned({ url: `${new URL(text.trim()).origin}/pay/${code}`, info }))
      .catch((e: any) => setScanError(e?.message || 'Este cobro ya no está disponible.'));
  };

  const resultCard = () => {
    if (state === 'loading') {
      return (
        <div className="p-4 rounded-3xl bg-white border border-[#e1e8f8] shadow-sm flex items-center gap-3 text-sm text-[#4a5f7e]" aria-live="polite">
          <Loader2 size={18} className="animate-spin text-[#1a3bb0]" aria-hidden="true" /> Validando si tiene Kuota…
        </div>
      );
    }
    if (state === 'error') return <p role="alert" className="p-4 rounded-3xl bg-red-50 border border-red-200 text-xs text-red-700">{errorMsg}</p>;
    if (state !== 'done' || !result || !phone) return null;

    const contact: ChargeContact = { phone, name: result.display_name, registered: result.registered, verified: result.verified, kind: result.kind };
    if (result.is_self) {
      return <p className="p-4 rounded-3xl bg-[#eff3ff] text-sm text-[#304670]">Este número es el tuyo. Prueba con el de tu cliente.</p>;
    }
    return (
      <div className="p-4 rounded-3xl bg-white border border-[#e1e8f8] shadow-sm space-y-3" aria-live="polite">
        <div className="flex items-center gap-3">
          {result.registered ? (
            <Avatar url={result.avatar_url} name={result.display_name} size={48} rounded="rounded-2xl" />
          ) : (
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 bg-slate-400"><UserPlus size={20} aria-hidden="true" /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-black text-[#0b2545] truncate">{result.registered ? result.display_name || 'Usuario Kuota' : 'Aún no tiene Kuota'}</p>
            <p className="text-[11px] text-[#4a5f7e]">{result.phone_masked}</p>
  {result.registered && (
    <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
      <BadgeCheck size={12} aria-hidden="true" /> {result.verified ? 'Negocio verificado' : 'Cuenta Kuota activa'}
    </span>
  )}
          </div>
        </div>
        <p className="text-xs text-[#4a5f7e] leading-relaxed">
          {result.registered
            ? 'Ya está en Kuota: no necesitas pedirle datos bancarios. Cóbrale con un link y lo recibe al instante.'
            : 'No tiene cuenta Kuota todavía. Igual puedes cobrarle con un link, o invitarlo a unirse.'}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => charge(contact)}
            className="flex-1 h-12 rounded-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition cursor-pointer">
            <Banknote size={17} aria-hidden="true" /> Cobrar
          </button>
          {!result.registered && (
            <a href={`https://wa.me/51${phone}?text=${encodeURIComponent('Hola, te invito a Kuota: compra con aKuotas! y cobra con link o QR sin datos bancarios.')}`}
              target="_blank" rel="noopener noreferrer"
              className="h-12 px-4 rounded-full bg-[#b6ccfd]/60 text-[#1a3bb0] font-bold text-sm flex items-center justify-center gap-2">
              <MessageCircle size={17} aria-hidden="true" /> Invitar
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 p-4 space-y-4 bg-[#f9f9ff] flex flex-col">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Volver al inicio"
          className="w-9 h-9 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#1a3bb0] active:scale-95 transition shadow-xs cursor-pointer">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <h1 className="text-lg font-black text-[#0b2545] tracking-tight">Cobrar y pagar</h1>
      </div>

      {/* Búsqueda inteligente: justo encima del lector de QR */}
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 h-14 px-4 rounded-full bg-white border border-[#e1e8f8] shadow-sm text-[#4a5f7e] focus-within:ring-2 focus-within:ring-[#1a3bb0]/40">
          <Search size={19} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 40))}
            type="search"
            inputMode="search"
            autoComplete="off"
            aria-label="Buscar por nombre o celular"
            placeholder="Busca por nombre o celular"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold text-[#0b2545] placeholder:text-[#4a5f7e]/70"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="w-7 h-7 rounded-full bg-[#eff3ff] flex items-center justify-center cursor-pointer">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>

        {resultCard()}
        {query && !phone && state === 'idle' && (
          <>
            {suggestions.map((r) => (
              <button key={r.phone} type="button" onClick={() => setQuery(r.phone)}
                className="w-full p-3 rounded-2xl bg-white border border-[#e1e8f8] flex items-center gap-3 text-left cursor-pointer">
                <span className="w-10 h-10 rounded-xl bg-[#eff3ff] text-[#1a3bb0] font-black flex items-center justify-center">{initials(r.name)}</span>
                <span className="min-w-0 flex-1"><b className="block text-sm text-[#0b2545] truncate">{r.name || 'Usuario Kuota'}</b><span className="text-[11px] text-[#4a5f7e]">Reciente · toca para validar</span></span>
              </button>
            ))}
            <p className="text-[11px] text-[#4a5f7e] px-1">
              {hasLetters && suggestions.length === 0 ? 'No hay recientes con ese nombre. ' : ''}Escribe el celular completo (9 dígitos) y validamos al instante si ya tiene Kuota.
            </p>
          </>
        )}

        {/* Lector de QR */}
        <section className="rounded-[28px] p-5 text-white bg-gradient-to-br from-[#00248b] to-[#1a3bb0] shadow-lg shadow-blue-900/20 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-14 h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center"><ScanLine size={28} aria-hidden="true" /></span>
            <div>
              <h2 className="font-black text-lg leading-tight">Escanear QR</h2>
              <p className="text-xs text-white/80">Paga a un negocio con su código de cobro</p>
            </div>
          </div>
          <button type="button" onClick={() => { setScanError(''); setScanning(true); }}
            className="w-full h-12 rounded-full bg-white text-[#00248b] font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition cursor-pointer">
            <QrCode size={18} aria-hidden="true" /> Abrir cámara
          </button>
          {scanError && <p role="alert" className="text-xs bg-white/15 rounded-xl p-2.5">{scanError}</p>}
        </section>

        <button type="button" onClick={() => onCharge(null)}
          className="w-full h-12 rounded-full bg-white border border-[#c9d5f3] text-[#00248b] font-bold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer">
          <Banknote size={17} aria-hidden="true" /> Cobrar con link, sin elegir contacto
        </button>
      </div>

      {recents.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-black text-[#4a5f7e] tracking-wider flex items-center gap-1.5"><History size={13} aria-hidden="true" /> RECIENTES</h2>
          {recents.map((r) => (
            <button key={r.phone} type="button" onClick={() => setQuery(r.phone)}
              className="w-full p-3 rounded-2xl bg-white border border-[#e1e8f8] flex items-center gap-3 text-left cursor-pointer">
              <span className="w-10 h-10 rounded-xl bg-[#eff3ff] text-[#1a3bb0] font-black flex items-center justify-center shrink-0">{initials(r.name)}</span>
              <span className="min-w-0 flex-1">
                <b className="block text-sm text-[#0b2545] truncate">{r.name || 'Contacto'}</b>
                <span className="text-[11px] text-[#4a5f7e]">+51 ••• ••• {r.phone.slice(-3)}</span>
              </span>
              {r.registered && <ShieldCheck size={16} className="text-emerald-600 shrink-0" aria-label="Tiene Kuota" />}
            </button>
          ))}
        </section>
      )}

      {scanning && (
        <React.Suspense fallback={null}>
          <QrScannerModal onResult={handleScan} onClose={() => setScanning(false)} />
        </React.Suspense>
      )}

      {scanned && (
        <div className="fixed inset-0 z-[67] flex items-end justify-center bg-black/45" onClick={() => setScanned(null)}>
          <div role="dialog" aria-modal="true" aria-label="Confirmar pago" onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-7 space-y-3">
            <p className="text-xs font-black tracking-wider text-[#1a3bb0]">CONFIRMA ANTES DE PAGAR</p>
            <div className="flex items-center gap-3">
              <Avatar url={scanned.info.merchant.avatar_url} name={scanned.info.merchant.name} size={48} rounded="rounded-2xl" />
              <div className="min-w-0">
                <p className="font-black text-[#0b2545] truncate">{scanned.info.merchant.name}</p>
                <p className="text-[11px] text-[#4a5f7e]">{scanned.info.merchant.verification === 'VERIFIED' ? 'Negocio verificado' : 'Negocio sin verificar'}{scanned.info.merchant.ruc_masked ? ` · RUC ${scanned.info.merchant.ruc_masked}` : ''}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-[#eff3ff] p-3.5 text-sm space-y-1">
              {scanned.info.concept && <div className="flex justify-between gap-3"><span className="text-[#4a5f7e]">Concepto</span><b className="text-right">{scanned.info.concept}</b></div>}
              <div className="flex justify-between gap-3 items-baseline"><span className="font-bold">Total a pagar</span><b className="text-xl text-[#1a3bb0] tabular-nums">{soles(scanned.info.amount_cents)}</b></div>
            </div>
            <a href={scanned.url} target="_blank" rel="noopener noreferrer"
              className="w-full h-12 rounded-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg">
              Pagar {soles(scanned.info.amount_cents)}
            </a>
            <button type="button" onClick={() => setScanned(null)} className="w-full h-10 text-sm font-bold text-[#4a5f7e] cursor-pointer">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};
