// Reglas antifraude por defecto. Se siembran en la tabla risk_rules y desde ahí
// se editan (umbral, acción, activa/inactiva) sin redeploy: PUT /internal/risk/rules/:id.

export type RiskAction = 'STEP_UP' | 'REVIEW' | 'BLOCK';
export type RiskContextKind = 'LINK_CREATE' | 'PAY_ATTEMPT' | 'ANY';

export interface RuleDefinition {
  id: string;
  context: RiskContextKind;
  description: string;
  action: RiskAction;
  params: Record<string, number>;
}

export const DEFAULT_RULES: RuleDefinition[] = [
  { id: 'list_black', context: 'ANY', action: 'BLOCK', params: {}, description: 'Comercio, dispositivo o IP en lista negra' },
  { id: 'list_gray', context: 'ANY', action: 'REVIEW', params: {}, description: 'Comercio, dispositivo o IP en lista gris' },
  {
    id: 'high_amount',
    context: 'LINK_CREATE',
    action: 'STEP_UP',
    params: {},
    description: 'Monto igual o mayor al umbral de confirmación del nivel del comercio'
  },
  {
    id: 'amount_vs_history',
    context: 'LINK_CREATE',
    action: 'STEP_UP',
    params: { multiplier: 5, min_paid: 3, lookback_days: 90 },
    description: 'Monto mayor a N veces el promedio cobrado por el comercio'
  },
  {
    id: 'link_velocity_review',
    context: 'LINK_CREATE',
    action: 'REVIEW',
    params: { window_min: 10, max_links: 10 },
    description: 'Muchos links creados en pocos minutos'
  },
  {
    id: 'link_velocity_block',
    context: 'LINK_CREATE',
    action: 'BLOCK',
    params: { window_min: 10, max_links: 25 },
    description: 'Ráfaga de links propia de automatización o abuso'
  },
  {
    id: 'new_merchant_volume',
    context: 'LINK_CREATE',
    action: 'REVIEW',
    params: { max_age_days: 7, daily_cents: 150_000 },
    description: 'Comercio nuevo con volumen repentino en el día'
  },
  {
    id: 'structuring',
    context: 'LINK_CREATE',
    action: 'REVIEW',
    params: { window_min: 60, min_links: 3, pct_of_limit: 90 },
    description: 'Cobros fraccionados justo debajo del límite por operación'
  },
  {
    id: 'unpaid_spike',
    context: 'LINK_CREATE',
    action: 'STEP_UP',
    params: { max_active_unpaid: 15 },
    description: 'Pico de links activos sin pagar'
  },
  {
    id: 'night_high_amount',
    context: 'LINK_CREATE',
    action: 'STEP_UP',
    params: { from_hour: 0, to_hour: 5, min_cents: 20_000 },
    description: 'Monto alto en horario inusual (madrugada en Lima)'
  },
  {
    id: 'device_cooldown',
    context: 'LINK_CREATE',
    action: 'STEP_UP',
    params: { min_cents: 10_000 },
    description: 'Dispositivo recién vinculado o PIN recién cambiado'
  },
  {
    id: 'shared_device',
    context: 'LINK_CREATE',
    action: 'REVIEW',
    params: { max_merchants: 2 },
    description: 'Un mismo dispositivo opera varios comercios'
  },
  {
    id: 'card_testing',
    context: 'PAY_ATTEMPT',
    action: 'BLOCK',
    params: { window_min: 10, max_failed: 5 },
    description: 'Intentos de pago fallidos repetidos (prueba de tarjetas robadas)'
  },
  {
    id: 'payer_velocity',
    context: 'PAY_ATTEMPT',
    action: 'BLOCK',
    params: { window_min: 10, max_attempts: 20 },
    description: 'Un mismo pagador intenta demasiados pagos en poco tiempo'
  }
];
