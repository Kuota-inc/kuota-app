import React, { useState } from 'react';
import { CobrosHubScreen, type ChargeContact } from './CobrosHubScreen';
import { PaymentLinkScreen } from './PaymentLinkScreen';

/** Vender: primero se elige a quién cobrar (o se escanea un QR); luego se arma el cobro con esos datos. */
export const CobrosFlow: React.FC<{ onBack: () => void; onNavigateTab: (tab: string) => void }> = ({ onBack, onNavigateTab }) => {
  const [step, setStep] = useState<'hub' | 'sale'>('hub');
  const [contact, setContact] = useState<ChargeContact | null>(null);

  if (step === 'sale') return <PaymentLinkScreen onBack={() => setStep('hub')} onNavigateTab={onNavigateTab} contact={contact} />;
  return (
    <CobrosHubScreen
      onBack={onBack}
      onCharge={(c) => {
        setContact(c);
        setStep('sale');
      }}
    />
  );
};
