import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Animates from the previous value to `value` (from 0 on first render). Instant with reduced motion. */
export function useCountUp(value: number, duration = 0.6): number {
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setCurrent(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setCurrent,
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduced]);

  return current;
}
