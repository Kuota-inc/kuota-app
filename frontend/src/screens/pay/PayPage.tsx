import React, { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, Loader2, ShieldCheck, Store } from 'lucide-react';
import { ApiError } from '../../api/client';
import { paymentsApi, type PublicLink } from '../../api/payments';

// Pantalla previa al pago (lo que ve el cliente al escanear el QR o abrir el
// link): nombre verificado del comercio y monto fijo ANTES de pagar. En
// producción el botón lleva a la página de pago alojada por 360pay; aquí usa
// el simulador de 360pay del backend de desarrollo.

const formatSoles = (cents: number) => `S/ ${(cents / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; link: PublicLink }
  | { kind: 'paying'; link: PublicLink }
  | { kind: 'paid'; link: PublicLink }
  | { kind: 'error'; title: string; message: string };

function errorState(e: unknown): State {
  if (e instanceof ApiError) {
    if (e.code === 'LINK_ALREADY_PAID') return { kind: 'error', title: 'Este cobro ya fue pagado', message: 'No necesitas pagarlo otra vez.' };
    if (e.code === 'LINK_NOT_FOUND' || e.code === 'LINK_UNAVAILABLE') {
      return { kind: 'error', title: 'Link no disponible', message: 'Este link no existe, venció o fue cancelado. Pide al comercio uno nuevo.' };
    }
    if (e.code === 'RATE_LIMITED') return { kind: 'error', title: 'Espera un momento', message: e.message };
    return { kind: 'error', title: 'No pudimos continuar', message: e.message };
  }
  return { kind: 'error', title: 'No pudimos continuar', message: 'Inténtalo otra vez en unos minutos.' };
}

export const PayPage: React.FC<{ code: string }> = ({ code }) => {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [method, setMethod] = useState<'YAPE' | 'PLIN' | 'CARD'>('YAPE');

  useEffect(() => {
    let alive = true;
    paymentsApi
      .getPublicLink(code)
      .then((link) => alive && setState({ kind: 'ready', link }))
      .catch((e) => alive && setState(errorState(e)));
    return () => {
      alive = false;
    };
  }, [code]);

  const pay = async () => {
    if (state.kind !== 'ready') return;
    const link = state.link;
    setState({ kind: 'paying', link });
    try {
      const r = await paymentsApi.sandboxPay(link.code, method);
      setState(
        r.webhook.status === 'PROCESSED'
          ? { kind: 'paid', link }
          : { kind: 'error', title: 'El pago no se completó', message: 'No se realizó ningún cargo. Inténtalo otra vez o usa otro medio.' }
      );
    } catch (e) {
      setState(errorState(e));
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#f9f9ff] flex flex-col items-center px-4 py-8 text-[#151c27]">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-center gap-2">
          <img src="/brand/LogoKuota_.png" alt="" className="w-8 h-8 rounded-lg object-contain" />
          <span className="text-lg font-black text-[#00248b] tracking-tight">Kuota</span>
        </div>

        {state.kind === 'loading' && (
          <div className="p-10 flex justify-center" role="status" aria-label="Cargando cobro">
            <Loader2 size={28} className="text-[#1a3bb0] motion-safe:animate-spin" />
          </div>
        )}

        {state.kind === 'error' && (
          <section className="p-6 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm text-center space-y-2" role="alert">
            <AlertTriangle size={32} className="mx-auto text-amber-600" aria-hidden="true" />
            <h1 className="text-base font-black">{state.title}</h1>
            <p className="text-xs text-[#4a5f7e]">{state.message}</p>
          </section>
        )}

        {(state.kind === 'ready' || state.kind === 'paying') && (
          <>
            <section className="p-5 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm space-y-4" aria-labelledby="pay-merchant">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#e7eefe] text-[#1a3bb0] flex items-center justify-center shrink-0">
                  <Store size={22} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#4a5f7e]">Vas a pagar a</p>
                  <h1 id="pay-merchant" className="text-base font-black leading-tight truncate">
                    {state.link.merchant.name}
                  </h1>
                  <p className="text-[11px] text-[#4a5f7e]">
                    {[state.link.merchant.ruc_masked && `RUC ${state.link.merchant.ruc_masked}`, state.link.merchant.city].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <p
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  state.link.merchant.verification === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#eff3ff] text-[#304670]'
                }`}
              >
                {state.link.merchant.verification === 'VERIFIED' ? <BadgeCheck size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
                {state.link.merchant.verification === 'VERIFIED' ? 'Comercio verificado por Kuota' : 'Comercio con verificación básica'}
              </p>

              <div className="text-center py-2 border-y border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#4a5f7e]">{state.link.concept ?? 'Cobro'}</p>
                <p className="text-4xl font-black text-[#0b2545] tracking-tight mt-1">{formatSoles(state.link.amount_cents)}</p>
                <p className="text-[11px] text-[#4a5f7e] mt-1 inline-flex items-center gap-1">
                  <Clock size={12} aria-hidden="true" /> Válido hasta el {formatWhen(state.link.expires_at)}
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-[11px] font-bold text-[#4a5f7e] mb-1">Medio de pago</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(['YAPE', 'PLIN', 'CARD'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={method === m}
                      onClick={() => setMethod(m)}
                      className={`h-10 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        method === m ? 'bg-[#1a3bb0] text-white border-[#1a3bb0]' : 'bg-white text-[#0b2545] border-[#e1e8f8]'
                      }`}
                    >
                      {m === 'CARD' ? 'Tarjeta' : m === 'YAPE' ? 'Yape' : 'Plin'}
                    </button>
                  ))}
                </div>
              </fieldset>

              <button
                type="button"
                onClick={pay}
                disabled={state.kind === 'paying'}
                className="w-full h-12 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {state.kind === 'paying' ? <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
                {state.kind === 'paying' ? 'Procesando…' : `Pagar ${formatSoles(state.link.amount_cents)}`}
              </button>
              <p className="text-[10px] text-center text-[#4a5f7e]">Entorno de prueba: el pago es simulado por el sandbox de 360pay.</p>
            </section>

            <section className="p-4 rounded-2xl bg-[#eff3ff] border border-[#d8e2ff] text-[11px] text-[#304670] space-y-1">
              <p className="font-bold">Antes de pagar, revisa:</p>
              <p>• Que el nombre del comercio sea el de quien te cobra. Si el QR está pegado sobre otro, no pagues y avisa al comercio.</p>
              <p>• Que el monto sea el acordado. Kuota nunca te pedirá claves ni códigos por WhatsApp.</p>
            </section>
          </>
        )}

        {state.kind === 'paid' && (
          <section className="p-6 bg-white rounded-3xl border border-emerald-200 shadow-sm text-center space-y-2" role="status">
            <CheckCircle2 size={40} className="mx-auto text-emerald-600" aria-hidden="true" />
            <h1 className="text-base font-black">¡Pago realizado!</h1>
            <p className="text-xs text-[#4a5f7e]">
              {state.link.merchant.name} ya recibió la confirmación de tu pago de {formatSoles(state.link.amount_cents)}.
            </p>
          </section>
        )}
      </div>
    </main>
  );
};
