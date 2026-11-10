import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { api } from '../../api/client';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Bell, Sparkles, ChevronRight } from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface HomeScreenProps {
  onNavigateTab: (tab: string) => void;
  onOpenKuotear: () => void;
  onOpenProfile?: () => void;
  onOpenNotifications?: () => void;
  /** true cuando el sheet de notificaciones ya las marcó como vistas. */
  notificationsSeen?: boolean;
}

const DEFAULT_HOME_DATA = {
  credit: {
    available_cents: 95000,
    total_cents: 140000,
    used_cents: 45000,
    debt_balance_cents: 45000
  },
  next_installment: {
    id: 'inst_demo_01',
    amount_cents: 15000,
    due_date: '2026-11-15',
    days_left: 12
  },
  level_progress: {
    current_level: 1,
    level_name: 'Semilla',
    current_limit_cents: 140000,
    next_limit_cents: 200000,
    punctual_payments: 2,
    required_payments: 4,
    progress_pct: 50
  },
  score: {
    score: 742,
    badge: 'Excelente'
  }
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02,
      delayChildren: 0.01
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', damping: 22, stiffness: 280 }
  }
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigateTab, onOpenKuotear, onOpenProfile, onOpenNotifications, notificationsSeen }) => {
  const toast = useToast();
  const [data, setData] = useState<any>(DEFAULT_HOME_DATA);
  const [scoreData, setScoreData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  const loadData = () => {
    api.getHome()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
    api.getMyScore()
      .then(setScoreData)
      .catch(() => {/* score no crítico */});
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePayInstallment = async (installmentId: string) => {
    setPaying(true);
    try {
      await api.payInstallment(installmentId);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar el pago.');
    } finally {
      setPaying(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-[#4a5f7e]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-9 h-9 border-3 border-[#1a3bb0] border-t-transparent rounded-full"
        />
        <span className="text-xs font-semibold mt-3 text-slate-500">Cargando Kuota...</span>
      </div>
    );
  }

  const unread = notificationsSeen ? 0 : data?.unread_notifications || 0;
  const credit = data?.credit;
  const nextInst = data?.next_installment;
  const progress = data?.level_progress;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex-1 p-4 space-y-4 bg-[#f9f9ff]"
    >
      {/* Top Bar: Greeting & Notifications */}
      <motion.div variants={itemVariants} className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <motion.button
            type="button"
            onClick={onOpenProfile}
            whileHover={{ scale: 1.1, rotate: 4 }}
            whileTap={{ scale: 0.92 }}
            animate={{
              y: [0, -2, 0],
              scale: [1, 1.03, 1]
            }}
            transition={{
              repeat: Infinity,
              duration: 3,
              ease: 'easeInOut'
            }}
            title="Ver Mi Perfil Y Negocio"
            className="cursor-pointer relative p-0.5 rounded-2xl bg-gradient-to-br from-[#00248b] to-[#1a3bb0] shadow-md shadow-blue-900/20 flex items-center justify-center shrink-0 border border-blue-400/30"
          >
            <img
              src="/brand/LogoKuota_.png"
              alt="Logo Kuota"
              className="w-9 h-9 object-contain drop-shadow-sm rounded-xl"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/brand/Group Logokuotasvg.svg';
              }}
            />
          </motion.button>
          <button
            type="button"
            onClick={onOpenProfile}
            className="cursor-pointer group select-none text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8c3ff]"
            title="Ver Mi Perfil Y Negocio"
          >
            <div className="text-[10px] font-semibold text-[#4a5f7e] group-hover:text-[#1a3bb0] transition-colors flex items-center gap-1">
              <span>{data?.greeting_prefix || 'Buenas noches'}</span>
              <span className="text-[10px] bg-blue-100 text-[#00248b] px-1 py-0.2 rounded font-bold">Perfil</span>
            </div>
            <div className="text-lg font-black text-[#0b2545] tracking-tight group-hover:text-[#00248b] transition-colors">
              {data?.greeting_name || ''}
            </div>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={onOpenNotifications}
            aria-label={unread > 0 ? `Abrir notificaciones (${unread} sin leer)` : 'Abrir notificaciones'}
            aria-haspopup="dialog"
            title="Notificaciones"
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            className="cursor-pointer w-9 h-9 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#4a5f7e] relative hover:bg-slate-50 transition shadow-sm"
          >
            <Bell size={18} aria-hidden="true" />
            <AnimatePresence>
              {unread > 0 && (
                <motion.span
                  aria-hidden="true"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white motion-safe:animate-pulse"
                />
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.div>

      {/* Hero Credit Card (PRD 05) with Shimmer & Floating Glow */}
      <motion.div
        variants={itemVariants}
        whileHover={{ scale: 1.01 }}
        transition={{ type: 'spring', damping: 20 }}
        className="p-4.5 bg-gradient-to-br from-[#00248b] via-[#1a3bb0] to-[#254bdb] rounded-3xl text-white shadow-xl shadow-blue-900/25 space-y-3 relative overflow-hidden"
      >
        {/* Subtle Decorative Gradient Circles */}
        <div className="absolute -right-8 -top-8 w-36 h-36 bg-blue-400/20 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute -left-8 -bottom-8 w-36 h-36 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex items-center justify-between relative z-10">
          <span className="text-[11px] font-medium text-blue-200 uppercase tracking-wider">
            Crédito disponible
          </span>
          <motion.span
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur text-[10px] font-bold border border-white/20 whitespace-nowrap shrink-0"
          >
            Nivel {credit?.level} · {credit?.level_name}
          </motion.span>
        </div>

        <div className="relative z-10">
          <div className="text-3xl font-black tracking-tight flex items-baseline">
            <span className="text-2xl mr-1 font-extrabold text-blue-200">S/</span>
            <AnimatedNumber value={(credit?.available_cents || 0) / 100} decimals={2} />
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-100 mt-0.5">
            <span>Poder de compra:</span>
            <span className="font-extrabold text-white">
              S/ <AnimatedNumber value={(credit?.purchasing_power_cents || 0) / 100} decimals={2} />
            </span>
            <span className="text-[10px] bg-blue-500/40 px-1.5 py-0.2 rounded font-semibold">
              {credit?.down_payment_pct}% inicial
            </span>
          </div>
        </div>

        {/* Animated Progress Bar */}
        <div className="space-y-1 pt-1 relative z-10">
          <div className="h-2 w-full bg-blue-950/40 rounded-full overflow-hidden p-0.5">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, Math.round(((credit?.available_cents || 0) / (credit?.total_limit_cents || 140000)) * 100))}%`
              }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
              className="h-full bg-gradient-to-r from-teal-300 to-emerald-400 rounded-full shadow-sm"
            />
          </div>
          <div className="flex justify-between text-[10px] text-blue-200">
            <span>Usado: S/ {((credit?.used_cents || 0) / 100).toFixed(2)}</span>
            <span>Total: S/ {((credit?.total_limit_cents || 140000) / 100).toFixed(2)}</span>
          </div>
        </div>

        <div className="pt-1 flex items-center justify-between border-t border-white/10 text-[10px] text-blue-200 relative z-10">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            Crédito rotativo activo
          </span>
        </div>
      </motion.div>

      {/* Próximo vencimiento card */}
      <AnimatePresence>
        {nextInst && (
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -2 }}
            className="p-3.5 bg-white rounded-2xl border border-blue-100 shadow-sm flex items-center justify-between"
          >
            <div className="space-y-0.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#1a3bb0]">
                Próximo vencimiento · Cuota {nextInst.number} de {nextInst.total}
              </div>
              <div className="text-xs font-bold text-[#0b2545] truncate max-w-[190px]">
                {nextInst.merchant_name}
              </div>
              <div className="text-[11px] text-[#4a5f7e]">
                Vence el <strong>{nextInst.due_date}</strong>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('calendario')}
                className="text-[11px] font-bold text-[#1a3bb0] underline cursor-pointer"
              >
                Ver calendario
              </button>
            </div>
            <div className="text-right flex flex-col items-end gap-1.5">
              <div className="text-sm font-black text-[#0b2545]">
                S/ {(nextInst.amount_cents / 100).toFixed(2)}
              </div>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => handlePayInstallment(nextInst.installment_id)}
                disabled={paying}
                className="px-3.5 py-1.5 bg-white border-2 border-[#1a3bb0] text-[#00248b] rounded-xl text-xs font-black transition cursor-pointer"
              >
                {paying ? '...' : 'Pagar ahora'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Acción principal: un solo botón primario por pantalla. Comprar a crédito vive en el botón central de la barra. */}
      <motion.div variants={itemVariants}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigateTab('cobros')}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-black text-base shadow-lg shadow-blue-900/25 flex items-center justify-center gap-2.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-2xl">qr_code_2</span>
          Nuevo cobro
        </motion.button>
      </motion.div>

      {/* Consejo Kuota Progress */}
      <motion.div
        variants={itemVariants}
        whileHover={{ scale: 1.01 }}
        className="p-3.5 bg-white rounded-2xl border border-[#e1e8f8] shadow-sm space-y-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0b2545]">
            <Sparkles size={16} className="text-amber-500 animate-spin-slow" />
            <span>Camino al Nivel {progress?.next_level}</span>
          </div>
          <span className="text-[10px] font-bold text-[#1a3bb0]">
            {progress?.consecutive_on_time} de {progress?.target} compras puntuales
          </span>
        </div>
        <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, ((progress?.consecutive_on_time || 0) / (progress?.target || 3)) * 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-[#1a3bb0] to-emerald-500 rounded-full"
          />
        </div>
        <p className="text-[11px] text-[#4a5f7e]">
          Al completar 3 compras consecutivas sin retrasos, asciendes a <strong>Nivel 2</strong> y tu inicial baja de 50% a 40%.
        </p>
      </motion.div>

      {/* Score Kuota — Bloque 1 + 5 */}
      {scoreData && (
        <motion.div
          variants={itemVariants}
          whileHover={{ scale: 1.01 }}
          className="p-3.5 bg-white rounded-2xl border border-[#e1e8f8] shadow-sm space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0b2545]">
              <span className="material-symbols-outlined text-base text-[#1a3bb0]">speed</span>
              <span>Score Kuota · Nivel {scoreData.level} {scoreData.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {scoreData.scoring_level >= 1 && (
                <span className="text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded-full">
                  SUNAT ✓
                </span>
              )}
              <span className="text-sm font-black text-[#1a3bb0]">
                <AnimatedNumber value={scoreData.total} decimals={0} />
              </span>
            </div>
          </div>
          {(() => {
            const LEVELS = [{ at: 450, name: 'Básico' }, { at: 600, name: 'Intermedio' }, { at: 750, name: 'Avanzado' }];
            const total = scoreData.total as number;
            const next = LEVELS.find((l) => l.at > total);
            const start = [...LEVELS].reverse().find((l) => l.at <= total)?.at ?? 300;
            const pct = next ? Math.max(4, Math.round(((total - start) / (next.at - start)) * 100)) : 100;
            return (
              <div className="space-y-1">
                <div className="h-2.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden" role="progressbar" aria-valuemin={start} aria-valuemax={next?.at ?? total} aria-valuenow={total}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-[#1a3bb0] to-teal-500 rounded-full"
                  />
                </div>
                <p className="text-[11px] font-bold text-[#0b2545]">
                  {next ? (
                    <>Te faltan <span className="text-[#1a3bb0]">{next.at - total} pts</span> para el nivel {next.name} · mejor límite de crédito</>
                  ) : (
                    <>¡Llegaste al nivel más alto! Sigue pagando a tiempo para mantenerlo.</>
                  )}
                </p>
              </div>
            );
          })()}
          {/* Level 0 dimensions */}
          <div className="grid grid-cols-3 gap-1 pt-0.5">
            {[
              { label: 'Pagos', val: scoreData.payment_behavior, max: 200 },
              { label: 'Ventas', val: scoreData.sales_regularity, max: 150 },
              { label: 'Clientes', val: scoreData.payer_diversity, max: 100 },
            ].map(({ label, val, max }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-[#4a5f7e] font-medium">{label}</div>
                <div className="text-[10px] font-bold text-[#0b2545]">{val}/{max}</div>
              </div>
            ))}
          </div>
          {/* Level 1 dimensions — solo si hay datos externos */}
          {scoreData.scoring_level >= 1 && (
            <div className="grid grid-cols-3 gap-1 border-t border-[#f0f4ff] pt-1.5">
              {[
                { label: 'SUNAT', val: scoreData.sunat_activo, max: 80 },
                { label: 'Formal', val: scoreData.formalizacion, max: 70 },
                { label: 'Yape/Plin', val: scoreData.captura_pagos, max: 50 },
              ].map(({ label, val, max }) => (
                <div key={label} className="text-center">
                  <div className="text-[10px] text-teal-600 font-medium">{label}</div>
                  <div className="text-[10px] font-bold text-teal-800">{val}/{max}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Beneficios de la Semana */}
      <motion.div variants={itemVariants} className="space-y-2 pb-2">
        <div className="flex items-center justify-between text-xs font-bold text-[#0b2545]">
          <span>Beneficios y Promociones</span>
        </div>

        {/* Featured Flyer Banner with interactive hover */}
        <motion.button
          type="button"
          onClick={onOpenKuotear}
          aria-label="Promoción Comercios Gamarra: 30% de descuento en la inicial. Comprar al crédito"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="block w-full h-28 rounded-2xl overflow-hidden shadow-sm border border-blue-100 relative group cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8c3ff]"
        >
          <img
            src="/brand/Kuotafly1_1.png"
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-2.5">
            <span className="text-[10px] font-bold text-white bg-[#1a3bb0]/85 px-2.5 py-0.5 rounded-full backdrop-blur shadow-sm">
              Comercios Gamarra · 30% dcto inicial
            </span>
          </div>
        </motion.button>

        <div className="space-y-2">
          {data?.promotions?.map((promo: any) => (
            <motion.div
              key={promo.id}
              whileHover={{ x: 2, scale: 1.01 }}
              className="p-3 bg-white rounded-2xl border border-[#e1e8f8] shadow-sm flex items-center justify-between hover:border-blue-200 transition"
            >
              <div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-[#1a3bb0]">
                  {promo.tag}
                </span>
                <div className="text-xs font-bold text-[#0b2545] mt-1">{promo.headline}</div>
                <div className="text-[10px] text-[#4a5f7e]">{promo.partner_name} · {promo.description}</div>
              </div>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg shrink-0">
                {promo.ends_in_days}d restantes
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};
