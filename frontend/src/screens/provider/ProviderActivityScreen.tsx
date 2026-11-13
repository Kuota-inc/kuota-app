import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { track } from '../../lib/analytics';
import {
  ArrowRight,
  Check,
  Package,
  Footprints,
  ShoppingBag,
  Wrench,
  Cpu,
  Layers,
} from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface ProviderActivityScreenProps {
  onNext: () => void;
}

const DEFAULT_PROVIDER_CATEGORIES = [
  { code: 'TEXTILES', label: 'Textiles y Confecciones', subtitle: 'Telas, avíos, hilos y prendas mayoristas' },
  { code: 'FOOTWEAR', label: 'Calzado e Insumos', subtitle: 'Cueros, suelas y calzado terminado' },
  { code: 'FOOD_WHOLESALE', label: 'Alimentos al por mayor', subtitle: 'Abarrotes, granos, sacos y bebidas' },
  { code: 'HARDWARE', label: 'Ferretería y Herramientas', subtitle: 'Materiales, pinturas y equipos' },
  { code: 'TECH_PARTS', label: 'Tecnología / Repuestos', subtitle: 'Componentes, accesorios y electrónica' },
  { code: 'OTHER', label: 'Otro rubro', subtitle: 'Otros insumos y productos industriales' }
];

const DEFAULT_PROVIDER_SENIORITIES = [
  { code: 'LT_6M', label: 'Menos de 6 meses', subtitle: 'Lanzamiento y primeras ventas mayoristas' },
  { code: '6M_1Y', label: '6 meses a 1 año', subtitle: 'Tracción comercial temprana' },
  { code: '1Y_3Y', label: '1 a 3 años', subtitle: 'Operación comercial establecida' },
  { code: 'GT_3Y', label: 'Más de 3 años', subtitle: 'Empresa consolidada con amplio catálogo' }
];

export const ProviderActivityScreen: React.FC<ProviderActivityScreenProps> = ({ onNext }) => {
  const toast = useToast();
  const [categories, setCategories] = useState(DEFAULT_PROVIDER_CATEGORIES);
  const [seniorities, setSeniorities] = useState(DEFAULT_PROVIDER_SENIORITIES);
  const [category, setCategory] = useState<string>('');
  const [seniority, setSeniority] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    api.getProviderCategories()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setCategories(data);
      })
      .catch((err) => console.warn('Using default provider categories:', err));

    api.getProviderSeniorityRanges()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setSeniorities(data);
      })
      .catch((err) => console.warn('Using default provider seniorities:', err));
  }, []);

  const handleContinue = async () => {
    setSaving(true);
    try {
      await api.saveProviderActivity({ category, seniority_range: seniority });
      track('provider_activity_saved', { category, seniority_range: seniority });
      onNext();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar actividad');
    } finally {
      setSaving(false);
    }
  };

  const renderCategoryIcon = (code: string, isSelected: boolean) => {
    const iconClass = isSelected ? 'text-[#1a3bb0]' : 'text-slate-500';
    switch (code) {
      case 'TEXTILES':
        return <Package size={20} className={iconClass} />;
      case 'FOOTWEAR':
        return <Footprints size={20} className={iconClass} />;
      case 'FOOD_WHOLESALE':
        return <ShoppingBag size={20} className={iconClass} />;
      case 'HARDWARE':
        return <Wrench size={20} className={iconClass} />;
      case 'TECH_PARTS':
        return <Cpu size={20} className={iconClass} />;
      default:
        return <Layers size={20} className={iconClass} />;
    }
  };

  return (
    <div className="flex-1 p-4.5 space-y-4 bg-[#f9f9ff] flex flex-col justify-between overflow-y-auto">
      <div className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-1 pt-0.5">
          <div className="flex justify-between items-center text-xs font-semibold text-[#4a5f7e]">
            <span>Paso 3 de 6</span>
            <span className="text-[#1a3bb0] font-bold">Actividad Comercial</span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <div className="h-full bg-[#1a3bb0] w-3/5 rounded-full transition-all duration-300"></div>
          </div>
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-xl font-black text-[#0b2545] tracking-tight">
            Rubro y volumen de venta
          </h1>
          <p className="text-xs text-[#4a5f7e] mt-1 leading-relaxed">
            Personalizaremos tus cotizaciones automáticas y el límite de crédito para tus compradores comerciales.
          </p>
        </div>

        {/* Categories */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#0b2545]">Insumo o producto predominante</label>
          <div className="grid grid-cols-2 gap-2.5">
            {categories.map((c) => {
              const selected = category === c.code;
              return (
                <motion.button
                  key={c.code}
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.01 }}
                  type="button"
                  onClick={() => setCategory(c.code)}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between min-h-[124px] h-auto cursor-pointer relative overflow-hidden ${
                    selected
                      ? 'bg-gradient-to-br from-[#eff3ff] to-[#e4ecff] border-2 border-[#1a3bb0] text-[#1a3bb0] shadow-md shadow-blue-900/10'
                      : 'bg-white border-[#e1e8f8] text-[#4a5f7e] hover:border-blue-200 shadow-xs'
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className={`p-1.5 rounded-xl ${selected ? 'bg-white shadow-sm' : 'bg-slate-50'}`}>
                      {renderCategoryIcon(c.code, selected)}
                    </div>
                    {selected && (
                      <span className="w-4 h-4 rounded-full bg-[#1a3bb0] text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className={`text-xs font-black tracking-tight leading-snug ${selected ? 'text-[#0b2545]' : 'text-slate-800'}`}>
                      {c.label}
                    </div>
                    <div className="text-[10px] text-[#4a5f7e] line-clamp-2 leading-tight mt-0.5">{c.subtitle}</div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Seniority */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-bold text-[#0b2545]">Tiempo de operación comercial</label>
          <div className="space-y-2">
            {seniorities.map((s) => {
              const selected = seniority === s.code;
              return (
                <motion.button
                  key={s.code}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setSeniority(s.code)}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition cursor-pointer ${
                    selected
                      ? 'bg-[#eff3ff] border-2 border-[#1a3bb0] text-[#0b2545] shadow-sm'
                      : 'bg-white border-[#e1e8f8] text-[#4a5f7e] hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="text-xs font-black text-[#0b2545]">{s.label}</div>
                    <div className="text-[11px] text-[#4a5f7e] mt-0.5">{s.subtitle}</div>
                  </div>
                  {selected && (
                    <span className="w-5 h-5 rounded-full bg-[#1a3bb0] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Button */}
      <div className="pt-3 pb-1">
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          onClick={handleContinue}
          disabled={saving || !category || !seniority}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-900/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
        >
          <span>{saving ? 'Guardando actividad...' : 'Confirmar y continuar a ubicación'}</span>
          <ArrowRight size={16} />
        </motion.button>
      </div>
    </div>
  );
};
