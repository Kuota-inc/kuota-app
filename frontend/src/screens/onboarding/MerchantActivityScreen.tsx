import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import {
  Sparkles,
  ArrowRight,
  Store,
  Check,
  Shirt,
  UtensilsCrossed,
  Gift,
  Footprints,
  Layers,
  Clock,
  TrendingUp,
  Award,
  Building2,
} from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface MerchantActivityScreenProps {
  sessionId: string;
  onNext: () => void;
}

// Catálogos iniciales inmediatos (garantizan renderizado instantáneo sin pantallas en blanco)
const DEFAULT_CATEGORIES = [
  {
    code: 'FASHION',
    label: 'Ropa y Moda',
    subtitle: 'Prendas, telas y confecciones',
    icon: 'fashion'
  },
  {
    code: 'FOOD',
    label: 'Comida / Bodega',
    subtitle: 'Abarrotes, alimentos y cafetería',
    icon: 'food'
  },
  {
    code: 'BEAUTY',
    label: 'Belleza y Cuidado',
    subtitle: 'Cosméticos y peluquería',
    icon: 'beauty'
  },
  {
    code: 'CRAFTS',
    label: 'Artesanías y Regalos',
    subtitle: 'Novedades, bazares y papelería',
    icon: 'crafts'
  },
  {
    code: 'FOOTWEAR',
    label: 'Calzado y Cuero',
    subtitle: 'Zapatos, zapatillas y carteras',
    icon: 'footwear'
  },
  {
    code: 'OTHER',
    label: 'Otros productos',
    subtitle: 'Artículos diversos y servicios',
    icon: 'other'
  }
];

const DEFAULT_SENIORITIES = [
  {
    code: 'STARTING',
    label: '0–6 meses',
    subtitle: 'Emprendimiento en fase inicial',
    badge: 'Inicio'
  },
  {
    code: 'GROWING',
    label: '6–12 meses',
    subtitle: 'Negocio con clientela fija',
    badge: 'Crecimiento'
  },
  {
    code: 'CONSOLIDATED',
    label: 'Más de 1 año',
    subtitle: 'Compras en cuotas extendidas sin comisiones iniciales',
    badge: 'Recomendado'
  }
];

export const MerchantActivityScreen: React.FC<MerchantActivityScreenProps> = ({ sessionId, onNext }) => {
  const toast = useToast();
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [seniorities, setSeniorities] = useState(DEFAULT_SENIORITIES);
  const [category, setCategory] = useState<string>('FASHION');
  const [seniority, setSeniority] = useState<string>('CONSOLIDATED');
  const [businessName, setBusinessName] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Sincronizar con API si está disponible
    api.getBusinessCategories()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data);
        }
      })
      .catch((err) => console.warn('Using default business categories:', err));

    api.getSeniorityRanges()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeniorities(data);
        }
      })
      .catch((err) => console.warn('Using default seniority ranges:', err));
  }, []);

  const handleContinue = async () => {
    if (!businessName.trim()) {
      toast.error('Por favor ingresa el nombre de tu tienda o negocio.');
      return;
    }
    if (!category || !seniority) {
      toast.error('Por favor completa todos los campos.');
      return;
    }
    setSaving(true);
    try {
      await api.saveMerchantActivity(sessionId, {
        category,
        seniority_range: seniority,
        business_name: businessName.trim()
      });
      onNext();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar la actividad');
    } finally {
      setSaving(false);
    }
  };

  // Helper para renderizar iconos Lucide consistentes
  const renderCategoryIcon = (code: string, isSelected: boolean) => {
    const iconClass = isSelected ? 'text-[#1a3bb0]' : 'text-slate-500';
    switch (code) {
      case 'FASHION':
        return <Shirt size={22} className={iconClass} />;
      case 'FOOD':
        return <UtensilsCrossed size={22} className={iconClass} />;
      case 'BEAUTY':
        return <Sparkles size={22} className={iconClass} />;
      case 'CRAFTS':
        return <Gift size={22} className={iconClass} />;
      case 'FOOTWEAR':
        return <Footprints size={22} className={iconClass} />;
      default:
        return <Layers size={22} className={iconClass} />;
    }
  };

  const renderSeniorityIcon = (code: string, isSelected: boolean) => {
    const iconClass = isSelected ? 'text-[#1a3bb0]' : 'text-slate-500';
    switch (code) {
      case 'STARTING':
        return <Clock size={18} className={iconClass} />;
      case 'GROWING':
        return <TrendingUp size={18} className={iconClass} />;
      case 'CONSOLIDATED':
        return <Award size={18} className={iconClass} />;
      default:
        return <Building2 size={18} className={iconClass} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4.5 bg-[#f9f9ff] overflow-y-auto">
      <div className="space-y-4">
        {/* Step Progress Bar */}
        <div className="space-y-1 pt-0.5">
          <div className="flex justify-between items-center text-xs font-semibold text-[#4a5f7e]">
            <span>Paso 3 de 5</span>
            <span className="text-[#1a3bb0] font-bold">Actividad Comercial</span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <div className="h-full bg-[#1a3bb0] w-1/3 rounded-full transition-all duration-300"></div>
          </div>
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
            ¿A qué se dedica tu negocio?
          </h1>
          <p className="text-xs text-[#4a5f7e] mt-1 leading-relaxed">
            Personalizaremos tu línea de crédito y te conectaremos con proveedores mayoristas de tu rubro.
          </p>
        </div>

        {/* Business Name Field */}
        <div className="space-y-1.5">
          <label htmlFor="merchant-activity-field-1" className="text-xs font-bold text-[#0b2545] flex items-center gap-1.5">
            <Store size={14} className="text-[#1a3bb0]" />
            <span>Nombre comercial de tu tienda</span>
          </label>
          <div className="relative">
            <input
              id="merchant-activity-field-1"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Ej. Bodega San Martín, Confecciones Lili"
              className="w-full px-4 py-3 rounded-2xl bg-white border border-[#c5c5d6] text-sm font-bold text-[#0b2545] focus:outline-none focus:border-[#1a3bb0] focus:ring-2 focus:ring-[#1a3bb0]/20 shadow-sm transition"
            />
          </div>
        </div>

        {/* Category Grid (Opciones interactivas con iconos y selección clara) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#0b2545]">
            ¿Qué rubro o productos vendes?
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {categories.map((cat) => {
              const selected = category === cat.code;
              return (
                <motion.button
                  key={cat.code}
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.01 }}
                  type="button"
                  onClick={() => setCategory(cat.code)}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between min-h-[124px] h-auto cursor-pointer relative overflow-hidden ${
                    selected
                      ? 'bg-gradient-to-br from-[#eff3ff] to-[#e4ecff] border-2 border-[#1a3bb0] text-[#1a3bb0] shadow-md shadow-blue-900/10'
                      : 'bg-white border-[#e1e8f8] text-[#4a5f7e] hover:border-blue-200 shadow-xs'
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className={`p-2 rounded-xl ${selected ? 'bg-white shadow-sm' : 'bg-slate-50'}`}>
                      {renderCategoryIcon(cat.code, selected)}
                    </div>
                    {selected && (
                      <span className="w-5 h-5 rounded-full bg-[#1a3bb0] text-white flex items-center justify-center shadow-sm">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className={`text-xs font-black tracking-tight leading-snug ${selected ? 'text-[#0b2545]' : 'text-slate-800'}`}>
                      {cat.label}
                    </div>
                    <div className="text-[10px] text-[#4a5f7e] line-clamp-2 leading-tight mt-0.5">
                      {cat.subtitle || (cat as any).description}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Seniority Range Selector */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-bold text-[#0b2545]">
            ¿Hace cuánto tiempo opera tu negocio?
          </label>
          <div className="space-y-2">
            {seniorities.map((sen) => {
              const selected = seniority === sen.code;
              return (
                <motion.button
                  key={sen.code}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setSeniority(sen.code)}
                  className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition cursor-pointer ${
                    selected
                      ? 'bg-[#eff3ff] border-2 border-[#1a3bb0] text-[#0b2545] shadow-sm'
                      : 'bg-white border-[#e1e8f8] text-[#4a5f7e] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl shrink-0 ${selected ? 'bg-[#1a3bb0]/10 text-[#1a3bb0]' : 'bg-slate-50 text-slate-500'}`}>
                      {renderSeniorityIcon(sen.code, selected)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-[#0b2545]">{sen.label}</span>
                        {sen.badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                            selected ? 'bg-[#1a3bb0] text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {sen.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#4a5f7e] mt-0.5 leading-snug">
                        {sen.subtitle}
                      </div>
                    </div>
                  </div>
                  {selected && (
                    <span className="w-5 h-5 rounded-full bg-[#1a3bb0] text-white flex items-center justify-center shrink-0 shadow-sm ml-2">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Promotional Benefit Banner */}
        <div className="p-3.5 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 rounded-2xl border border-blue-200/70 flex items-start gap-2.5 shadow-sm">
          <Sparkles size={18} className="text-[#1a3bb0] shrink-0 mt-0.5" />
          <div className="text-[11px] text-[#0b2545] leading-relaxed">
            <span className="font-black text-[#1a3bb0]">Microcrédito Ágil:</span> Tasa preferencial para tu comercio. Los negocios con más de 1 año acceden inmediatamente a compras en cuotas extendidas.
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-4 pb-1">
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          onClick={handleContinue}
          disabled={saving}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-900/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
        >
          <span>{saving ? 'Guardando actividad...' : 'Continuar al catálogo'}</span>
          <ArrowRight size={16} />
        </motion.button>
      </div>
    </div>
  );
};
