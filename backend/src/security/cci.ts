// Código de Cuenta Interbancario (CCI) peruano: 20 dígitos = banco (3) + oficina (3) + cuenta (12) + control (2).
// Solo se valida la forma y que el código de banco coincida con el banco elegido (evita errores de tipeo
// que mandarían el dinero a otra cuenta). La titularidad la confirma el banco al primer abono.

export const BANKS: Record<string, string> = {
  '002': 'BCP',
  '003': 'Interbank',
  '009': 'Scotiabank',
  '011': 'BBVA',
  '018': 'Banco de la Nación',
  '038': 'BanBif'
};

export const BANK_BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(BANKS).map(([code, name]) => [name, code]));

export type CciCheck = { ok: true; cci: string; bank: string } | { ok: false; code: string; message: string };

export function checkCci(rawCci: unknown, rawBank: unknown): CciCheck {
  const cci = typeof rawCci === 'string' ? rawCci.replace(/[\s-]/g, '') : '';
  if (!/^\d{20}$/.test(cci)) {
    return { ok: false, code: 'CCI_INVALID', message: 'El CCI tiene 20 dígitos. Cópialo de tu banca por internet o de tu estado de cuenta.' };
  }
  if (/^(\d)\1{19}$/.test(cci)) {
    return { ok: false, code: 'CCI_INVALID', message: 'Ese CCI no es válido. Revísalo en tu banca por internet.' };
  }
  const bank = typeof rawBank === 'string' ? rawBank.trim() : '';
  const expectedCode = BANK_BY_NAME[bank];
  const prefixBank = BANKS[cci.slice(0, 3)];
  if (expectedCode && cci.slice(0, 3) !== expectedCode) {
    return { ok: false, code: 'CCI_BANK_MISMATCH', message: `Ese CCI no es de ${bank}${prefixBank ? ` (parece de ${prefixBank})` : ''}. Revisa el banco o el número.` };
  }
  return { ok: true, cci, bank: expectedCode ? bank : prefixBank ?? (bank || 'Otro banco') };
}
