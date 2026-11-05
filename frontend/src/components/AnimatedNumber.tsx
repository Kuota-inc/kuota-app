import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 320,
  decimals = 2,
  prefix = '',
  suffix = ''
}) => {
  const reduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<number>(value);
  // Valor mostrado en cada frame: la siguiente animación parte de aquí, aunque
  // la anterior no haya terminado.
  const shownRef = useRef(value);

  useEffect(() => {
    const startValue = shownRef.current;
    const change = value - startValue;
    let frame = 0;
    let start: number | null = null;

    if (reduceMotion || change === 0 || duration <= 0) {
      shownRef.current = value;
      frame = window.requestAnimationFrame(() => setDisplayValue(value));
      return () => window.cancelAnimationFrame(frame);
    }

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
      const current = progress < 1 ? startValue + change * eased : value;
      shownRef.current = current;
      setDisplayValue(current);
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [value, duration, reduceMotion]);

  return (
    <span>
      {prefix}
      {displayValue.toLocaleString('es-PE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })}
      {suffix}
    </span>
  );
};
