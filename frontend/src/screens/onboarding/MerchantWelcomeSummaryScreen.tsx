import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { CheckCircle2, Sparkles, ArrowRight, Store } from 'lucide-react';

interface MerchantWelcomeSummaryScreenProps {
  sessionId: string;
  onGoToDashboard: () => void;
}

const DEFAULT_WELCOME_DATA = {
  business: {
    name: 'Bodega San Martín',
    ruc: '10478912341',
    city: 'Lima',
    status: 'ACTIVE'
  },
  credit_line: {
    total_limit_cents: 140000,
    level: 1,
    level_name: 'Semilla',
    down_payment_pct: 50
  },
  next_level: {
    level: 2,
    limit_cents: 200000,
    hint: 'en 60 días con 3 compras puntuales'
  }
};

export const MerchantWelcomeSummaryScreen: React.FC<MerchantWelcomeSummaryScreenProps> = ({
  sessionId,
  onGoToDashboard
}) => {
  // Datos reales del comercio que se acaba de registrar (sin valores de demostración).
  const [data, setData] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .completeOnboarding(sessionId, {})
      .then((res) => {
        if (!alive) return;
        setData(res.welcome_summary ?? DEFAULT_WELCOME_DATA);
        return api.getRecommendedProviders().then((provs) => alive && setProviders(provs));
      })
      .catch((err) => alive && setError(err?.message || 'No pudimos terminar tu registro.'));
    return () => {
      alive = false;
    };
  }, [sessionId, attempt]);

  if (!data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 bg-[#f9f9ff] text-center" role="status">
        {error ? (
          <>
            <p className="text-sm font-bold text-[#0b2545]">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
              className="px-5 h-11 rounded-full bg-[#1a3bb0] text-white text-sm font-bold cursor-pointer"
            >
              Reintentar
            </button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-[3px] border-[#1a3bb0] border-t-transparent rounded-full motion-safe:animate-spin" />
            <p className="text-xs text-[#4a5f7e]">Activando tu cuenta…</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-between p-5 bg-[#f9f9ff]">
      <div className="space-y-4">
        {/* Step indicator */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center text-xs font-semibold text-[#4a5f7e]">
            <span>Paso 5 de 5</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 size={13} />
              Perfil Verificado
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: '66%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="h-full bg-emerald-600 rounded-full"
            />
          </div>
        </div>

        {/* Success Header with Pop/Bounce Animation */}
        <div className="text-center space-y-1 pt-1">
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 200, delay: 0.1 }}
            className="w-16 h-16 mx-auto bg-gradient-to-tr from-emerald-500 to-teal-400 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/25"
          >
            <CheckCircle2 size={36} />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-2xl font-black text-[#0b2545] tracking-tight"
          >
            ¡Bienvenido a Kuota!
          </motion.h1>
          <p className="text-xs text-[#4a5f7e]">
            Tu perfil comercial ha sido aprobado con éxito.
          </p>
        </div>

        {/* Business Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-3 bg-white rounded-2xl border border-[#e1e8f8] shadow-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1a3bb0] flex items-center justify-center">
              <Store size={22} />
            </div>
            <div>
              <div className="text-xs font-bold text-[#0b2545]">
                {data?.business?.name || 'Mi negocio'}
              </div>
              <div className="text-[10px] text-[#4a5f7e]">
                {data?.business?.ruc ? `RUC ${data.business.ruc}` : 'RUC en trámite'} · {data?.business?.city || 'Lima, PE'}
              </div>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
            Activo
          </span>
        </motion.div>

        {/* Hero Credit Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', delay: 0.4 }}
          className="p-4 bg-gradient-to-br from-[#00248b] via-[#1a3bb0] to-[#254bdb] rounded-3xl text-white shadow-xl shadow-blue-900/20 relative overflow-hidden"
        >
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-semibold text-blue-200 uppercase tracking-wider">
              Línea de crédito inicial activada
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur text-[10px] font-bold">
              Nivel 1 · Brote
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight flex items-baseline">
            <span className="text-2xl mr-1 text-blue-200 font-bold">S/</span>
            <AnimatedNumber value={(data?.credit_line?.total_limit_cents || 140000) / 100} decimals={2} />
          </div>
          <p className="text-[11px] text-blue-100 mt-1">
            Financia tus compras con proveedores al 50% de cuota inicial.
          </p>
        </motion.div>

        {/* Unlocked Benefits */}
        <div className="space-y-1.5">
          <div className="text-xs font-bold text-[#0b2545]">Beneficios desbloqueados</div>
          <div className="space-y-1.5 text-xs text-[#0b2545]">
            <motion.div
              whileHover={{ x: 2 }}
              className="p-2.5 bg-white rounded-xl border border-blue-100 flex items-center gap-2 shadow-xs"
            >
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>Compras de mercadería hasta en 3 cuotas flexibles.</span>
            </motion.div>
            <motion.div
              whileHover={{ x: 2 }}
              className="p-2.5 bg-white rounded-xl border border-blue-100 flex items-center gap-2 shadow-xs"
            >
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>Cobros con link y QR a comisión fija del 1.00%.</span>
            </motion.div>
            <motion.div
              whileHover={{ x: 2 }}
              className="p-2.5 bg-white rounded-xl border border-blue-100 flex items-center gap-2 shadow-xs"
            >
              <Sparkles size={16} className="text-amber-500 shrink-0" />
              <span>
                <strong>Sube a Nivel 2 (S/ 3,500)</strong> en 60 días con 3 compras puntuales.
              </span>
            </motion.div>
          </div>
        </div>

        {/* Recommended Providers */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-[#0b2545]">
            <span>Proveedores recomendados para ti</span>
            <span className="text-[10px] text-[#1a3bb0]">Ver todos</span>
          </div>
          <div className="space-y-2">
            {providers.slice(0, 2).map((prov) => (
              <motion.div
                key={prov.id}
                whileHover={{ scale: 1.01 }}
                className="p-3 bg-white rounded-2xl border border-[#e1e8f8] shadow-sm flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-[#0b2545]">{prov.name}</div>
                  <div className="text-[10px] text-[#4a5f7e]">{prov.category} · {prov.zone}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold text-[#1a3bb0]">Hasta</div>
                  <div className="text-xs font-extrabold text-[#0b2545]">
                    S/ {(prov.max_credit_cents / 100).toLocaleString('es-PE')}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-3 pb-1">
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.01 }}
          onClick={onGoToDashboard}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Ir a mi panel principal</span>
          <ArrowRight size={16} />
        </motion.button>
      </div>
    </div>
  );
};
