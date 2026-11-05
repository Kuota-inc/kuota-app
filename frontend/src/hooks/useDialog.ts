import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento accesible de un diálogo modal mientras está montado:
 * - mueve el foco adentro (a `initialFocus` o al primer elemento enfocable),
 * - Escape llama a `onClose`,
 * - Tab / Shift+Tab quedan atrapados dentro del diálogo,
 * - al desmontar devuelve el foco a quien lo abrió.
 *
 * Uso: `useDialog(ref, onClose)` y en el contenedor `role="dialog" aria-modal="true"`.
 */
export function useDialog(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: { enabled?: boolean; initialFocus?: RefObject<HTMLElement | null> } = {}
) {
  const { enabled = true, initialFocus } = options;
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const previous = document.activeElement as HTMLElement | null;

    const target = initialFocus?.current ?? container?.querySelector<HTMLElement>(FOCUSABLE) ?? container;
    if (target && !target.hasAttribute('tabindex') && target === container) container?.setAttribute('tabindex', '-1');
    target?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (!container) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !container.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    // Captura: el diálogo atiende Escape/Tab antes que listeners globales (p. ej. el teclado del PIN).
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [enabled, containerRef, initialFocus]);
}
