import { useWindowSize } from './useWindowSize';

/** Tailwind `md` breakpoint (768px). */
const MD_BREAKPOINT = 768;

/**
 * Returns `true` when the viewport is narrower than the Tailwind `md`
 * breakpoint (768 px).  Returns `false` on the server or before the first
 * paint (width === 0) so the initial render matches the desktop layout.
 */
export const useIsMobile = (): boolean => {
  const { width } = useWindowSize();
  return width > 0 && width < MD_BREAKPOINT;
};
