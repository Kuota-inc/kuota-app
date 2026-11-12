import React from 'react';
import { PaymentLinkScreen } from './PaymentLinkScreen';

/** Vender: va directo a Nueva Venta sin pantalla intermedia "Cobrar y pagar". */
export const CobrosFlow: React.FC<{ onBack: () => void; onNavigateTab: (tab: string) => void }> = ({ onBack, onNavigateTab }) => {
  return <PaymentLinkScreen onBack={onBack} onNavigateTab={onNavigateTab} contact={null} />;
};
