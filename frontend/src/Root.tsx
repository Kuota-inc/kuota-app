import { lazy, Suspense } from 'react';
import App from './App';

// /pay/<código>: pantalla del cliente que paga (link o QR de cobro); el resto es la app.
const PayPage = lazy(() => import('./screens/pay/PayPage').then((m) => ({ default: m.PayPage })));
const PAY_PATH = /^\/pay\/([A-Za-z0-9_.-]{1,64})\/?$/;

export function Root() {
  const payCode = window.location.pathname.match(PAY_PATH)?.[1];
  if (!payCode) return <App />;
  return (
    <Suspense fallback={null}>
      <PayPage code={payCode} />
    </Suspense>
  );
}
