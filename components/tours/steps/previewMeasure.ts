import { useEffect, useState } from 'react';

export interface Size {
  w: number;
  h: number;
}

// Callback-ref measuring, so nothing reads a ref during render.
export function useMeasured<T extends HTMLElement>(): [
  (el: T | null) => void,
  Size,
] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const read = () =>
      setSize((was) =>
        was.w === el.clientWidth && was.h === el.clientHeight
          ? was
          : { w: el.clientWidth, h: el.clientHeight }
      );
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, size];
}

export const TIP_W = 320;
export const TIP_H = 140;

export const noop = () => undefined;
