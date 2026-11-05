import React, { useState } from 'react';
import { api } from '../../api/client';
import { Plus, Trash2, ArrowRight, Sparkles, CheckCircle } from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface MerchantProductsScreenProps {
  sessionId: string;
  onNext: () => void;
}

interface ProductRow {
  name: string;
  price: string;
  is_frequent?: boolean;
}

export const MerchantProductsScreen: React.FC<MerchantProductsScreenProps> = ({ sessionId, onNext }) => {
  const toast = useToast();
  // Empieza vacío: cada comercio registra sus propios productos (paso opcional).
  const [products, setProducts] = useState<ProductRow[]>([{ name: '', price: '', is_frequent: false }]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>('Guardado automático');

  const addRow = () => {
    if (products.length >= 50) return;
    setProducts([...products, { name: '', price: '', is_frequent: false }]);
  };

  const removeRow = (index: number) => {
    const next = products.filter((_, i) => i !== index);
    setProducts(next.length > 0 ? next : [{ name: '', price: '' }]);
  };

  const updateRow = (index: number, field: keyof ProductRow, val: any) => {
    const next = [...products];
    next[index] = { ...next[index], [field]: val };
    setProducts(next);
    setLastSaved('Guardando cambios...');
    setTimeout(() => setLastSaved('Guardado automático'), 250);
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const validPayload = products
        .filter((p) => p.name.trim() && parseFloat(p.price) > 0)
        .map((p) => ({
          name: p.name.trim(),
          price_cents: Math.round(parseFloat(p.price) * 100),
          is_frequent: p.is_frequent
        }));

      await api.saveProducts(sessionId, validPayload);
      onNext();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar productos');
    } finally {
      setSaving(false);
    }
  };

  const validCount = products.filter((p) => p.name.trim() && parseFloat(p.price) > 0).length;

  return (
    <div className="flex-1 flex flex-col justify-between p-5 bg-[#f9f9ff]">
      <div className="space-y-4">
        {/* Step Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center text-xs font-semibold text-[#4a5f7e]">
            <span>Paso 4 de 5</span>
            <span className="text-[#1a3bb0]">Catálogo Inicial</span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <div className="h-full bg-[#1a3bb0] w-2/3 rounded-full transition-all duration-300"></div>
          </div>
        </div>

        {/* Heading & Status */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
              Añade tus productos
            </h1>
            <p className="text-xs text-[#4a5f7e] mt-0.5">
              Registra lo que más vendes para agilizar tus cobros por link.
            </p>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <CheckCircle size={12} />
            <span>{lastSaved}</span>
          </div>
        </div>

        {/* Counter Badge */}
        <div className="flex items-center justify-between text-xs font-bold text-[#0b2545]">
          <span>{validCount} {validCount === 1 ? 'producto registrado' : 'productos registrados'}</span>
          <span className="text-[11px] font-normal text-[#4a5f7e]">(Paso opcional)</span>
        </div>

        {/* Product Rows */}
        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
          {products.map((row, idx) => (
            <div
              key={idx}
              className="p-3 bg-white rounded-2xl border border-[#e1e8f8] shadow-sm flex items-center gap-2"
            >
              <div className="flex-1 space-y-1">
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(idx, 'name', e.target.value)}
                  aria-label={`Nombre del producto ${idx + 1}`}
                  maxLength={60}
                  placeholder="Ej. Blusa lino, Saco arroz 50kg"
                  className="w-full text-xs font-bold text-[#0b2545] placeholder:text-slate-400 focus:outline-none"
                />
                <div className="flex items-center gap-1 text-xs text-[#1a3bb0] font-extrabold">
                  <span>S/</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    aria-label={`Precio del producto ${idx + 1} en soles`}
                    value={row.price}
                    onChange={(e) => updateRow(idx, 'price', e.target.value)}
                    placeholder="0.00"
                    className="w-20 text-xs font-bold text-[#1a3bb0] focus:outline-none"
                  />
                </div>
              </div>

              {/* Frequent toggle */}
              <button
                type="button"
                onClick={() => updateRow(idx, 'is_frequent', !row.is_frequent)}
                title="Marcar como frecuente"
                aria-label={`Marcar producto ${idx + 1} como frecuente`}
                aria-pressed={!!row.is_frequent}
                className={`p-1.5 rounded-lg text-xs font-semibold transition ${
                  row.is_frequent ? 'bg-amber-100 text-amber-800' : 'text-slate-400 hover:bg-slate-100'
                }`}
              >
                ★
              </button>

              {/* Delete row */}
              <button
                type="button"
                onClick={() => removeRow(idx)}
                aria-label={`Eliminar producto ${idx + 1}`}
                title="Eliminar producto"
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Another Row Button */}
        <button
          type="button"
          onClick={addRow}
          className="w-full py-2.5 border-2 border-dashed border-[#afc5f6] hover:border-[#1a3bb0] text-[#1a3bb0] rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 bg-white/50"
        >
          <Plus size={16} />
          <span>Añadir otro producto</span>
        </button>

        {/* Commercial Tip */}
        <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-100 flex items-start gap-2">
          <Sparkles size={16} className="text-[#1a3bb0] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#0b2545] leading-tight">
            <span className="font-bold">Consejo comercial:</span> Los comercios con precios listados aumentan un 38% la velocidad de cierre de cobros.
          </p>
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-3 pb-1">
        <button
          onClick={handleFinish}
          disabled={saving}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          <span>{saving ? 'Activando perfil...' : 'Comenzar'}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};
