import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { installMock, DEMO_PIN } from './mock';
import { App } from '../App';
import { PayPage } from '../screens/pay/PayPage';

installMock(); // antes de montar: ninguna pantalla llega a ver la red real

function Demo() {
  const [view, setView] = useState<'app' | 'pay'>('app');
  const tab = (v: 'app' | 'pay', label: string) => (
    <button onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === v ? 'bg-[#1a3bb0] text-white' : 'bg-slate-700 text-slate-300'}`}>
      {label}
    </button>
  );
  return (
    <div className="w-full">
      <div className="fixed top-0 inset-x-0 z-[100] bg-slate-800 border-b border-slate-700 px-4 py-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        <strong className="text-white">Kuota · Demo</strong>
        {tab('app', 'App (Emprendedor / Proveedor)')}
        {tab('pay', 'Cliente final (página de pago)')}
        <span className="ml-auto">PIN correcto: <strong className="text-emerald-300">{DEMO_PIN}</strong> · cualquier otro muestra el error</span>
      </div>
      <div className="pt-12">{view === 'app' ? <App /> : <PayPage key="pay" code="demoKuota.7Hq2Lw9XpZ" />}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>
);
