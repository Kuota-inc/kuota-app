import React, { useRef } from 'react';
import { useDialog } from '../hooks/useDialog';

interface DialogPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose: () => void;
  /** id del título visible; si no hay, usa `aria-label`. */
  labelledBy?: string;
  children: React.ReactNode;
}

/** Panel de un modal: rol de diálogo, Escape, foco atrapado y devolución del foco. */
export const DialogPanel: React.FC<DialogPanelProps> = ({ onClose, labelledBy, children, ...rest }) => {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} {...rest}>
      {children}
    </div>
  );
};
