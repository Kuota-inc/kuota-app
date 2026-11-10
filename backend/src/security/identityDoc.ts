// Documento de identidad de una persona: DNI peruano o carnet de extranjería (CE, emitido por Migraciones).

export type IdDocType = 'DNI' | 'CE';

export const parseDocType = (v: unknown): IdDocType => (v === 'CE' ? 'CE' : 'DNI');

/** Mayúsculas y solo letras y dígitos: "001-234 567" -> "001234567". */
export const normalizeDoc = (v: unknown): string => (typeof v === 'string' ? v.toUpperCase().replace(/[^0-9A-Z]/g, '') : '');

/** DNI: 8 dígitos. CE: 9 a 12 caracteres alfanuméricos. */
export function isValidDoc(type: IdDocType, normalized: string): boolean {
  return type === 'CE' ? /^[0-9A-Z]{9,12}$/.test(normalized) : /^\d{8}$/.test(normalized);
}

export function docError(type: IdDocType, who = ''): { code: string; message: string } {
  return type === 'CE'
    ? { code: 'CE_INVALID', message: `Ingresa el carnet de extranjería${who} tal como figura en el documento (9 a 12 caracteres).` }
    : { code: 'DNI_INVALID', message: `Ingresa un DNI${who} válido de 8 dígitos.` };
}
