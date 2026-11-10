// Titularidad del RUC. Que un RUC exista en SUNAT no prueba que sea de quien lo escribe:
// sin este control cualquiera podía adjudicarse el RUC de una empresa, cobrar con su nombre
// en la página de pago y bloquear al dueño real ("RUC ya registrado").
//
// - RUC 10 (persona natural con negocio): lleva el DNI del titular en los dígitos 3 a 10 → se verifica solo.
// - RUC 20/15/17 (empresas y otros): requiere revisión manual (KYB) antes de vender.
export type RucOwnership = 'MATCH' | 'MISMATCH' | 'NEEDS_REVIEW';

export function rucOwnership(ruc: string, dni: string | null | undefined): RucOwnership {
  if (ruc.startsWith('10')) return dni && ruc.slice(2, 10) === String(dni).padStart(8, '0') ? 'MATCH' : 'MISMATCH';
  return 'NEEDS_REVIEW';
}

export const RUC_NOT_YOURS = 'Ese RUC de persona natural no corresponde a tu DNI. Usa el RUC que está a tu nombre.';
export const RUC_IN_REVIEW = 'Recibimos tu RUC. Verificamos que representas a la empresa (hasta 1 día hábil) y te avisamos para que puedas vender.';
