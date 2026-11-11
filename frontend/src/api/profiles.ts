import { apiRequest, getMerchantId, getProviderId, setProviderId, setProviderToken } from './client';

export type ProfileKind = 'EMPRENDEDOR' | 'PROVIDER';

export interface ProfileAccess {
  business_name: string | null;
  ruc_verified: boolean;
  ruc_masked: string | null;
  payments_active: boolean;
  can_sell: boolean;
  next_step: 'ADD_RUC' | 'RUC_IN_REVIEW' | 'PAYWALL' | 'SELL';
  can_have_provider: boolean;
  provider: { id: string; business_name: string | null; kyc_status: string | null } | null;
}

// Color distintivo por perfil: el mismo en el modal de elección y en el botón de perfil.
export const PROFILE_META: Record<ProfileKind, { label: string; hint: string; color: string; soft: string }> = {
  EMPRENDEDOR: { label: 'Emprendedor', hint: 'Compra con aKuotas! y vende con Kuota Payments', color: '#1a3bb0', soft: '#eff3ff' },
  PROVIDER: { label: 'Proveedor', hint: 'Cobra a tus clientes y controla tus pedidos', color: '#0f766e', soft: '#e6f6f3' }
};

const ACTIVE_KEY = 'kuota.active_profile';
let memoryActive: ProfileKind | null = null;

export function getActiveProfile(): ProfileKind | null {
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    if (v === 'EMPRENDEDOR' || v === 'PROVIDER') return v;
  } catch {
    /* sin almacenamiento */
  }
  return memoryActive;
}

export function setActiveProfile(p: ProfileKind | null) {
  memoryActive = p;
  try {
    if (p) localStorage.setItem(ACTIVE_KEY, p);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

/** Perfiles que este dispositivo puede abrir ahora mismo (tiene credenciales de ambos). */
export function availableProfiles(): ProfileKind[] {
  const out: ProfileKind[] = [];
  if (getMerchantId()) out.push('EMPRENDEDOR');
  if (getProviderId()) out.push('PROVIDER');
  return out;
}

/** Guarda lo que devolvió el inicio de sesión y devuelve los perfiles disponibles. */
export function applyLoginProfiles(res: { profiles?: ProfileKind[]; provider?: { provider_id: string; provider_token: string } | null }): ProfileKind[] {
  if (res.provider?.provider_id) {
    setProviderId(res.provider.provider_id);
    setProviderToken(res.provider.provider_token);
  } else if (!res.profiles?.includes('PROVIDER') && getMerchantId()) {
    // Solo Emprendedor: no se conservan credenciales de Provider de una sesión anterior.
    setProviderId(null);
  }
  return res.profiles ?? availableProfiles();
}

export const profilesApi = {
  access: () => apiRequest<ProfileAccess>('/merchants/me/profile-access'),
  lookupRuc: (ruc: string) => apiRequest<{ ruc: string; razon_social: string; direccion: string | null }>(`/merchants/me/ruc/lookup/${encodeURIComponent(ruc)}`),
  addRuc: (ruc: string) => apiRequest<{ ruc_verified: boolean; ruc_masked: string; business_name: string; review?: 'PENDING'; message?: string }>('/merchants/me/ruc', { method: 'POST', body: JSON.stringify({ ruc }) }),
  activateSales: (plan: 'BASIC' | 'PRO' = 'BASIC') =>
    apiRequest<{ payments_active: boolean }>('/merchants/me/sales/activate', { method: 'POST', body: JSON.stringify({ plan }) }),
  createProvider: () =>
    apiRequest<{ provider_id: string; provider_token: string; business_name: string | null }>('/merchants/me/provider-profile', { method: 'POST' })
};
