const MIN_FIT_PX = 8;
// Leaves room for the drop shadow and sub-pixel rounding at the box edge.
const FIT_SAFETY = 0.94;

// Largest font size (px) at which `measurer` wraps within width x height without a word overflowing.
export function findFittingFontSize(
  measurer: HTMLElement,
  width: number,
  height: number
): number | null {
  if (width <= 0 || height <= 0) return null;
  measurer.style.maxWidth = `${width}px`;
  const fits = (px: number) => {
    measurer.style.fontSize = `${px}px`;
    return (
      measurer.scrollWidth <= width + 0.5 &&
      measurer.offsetHeight <= height + 0.5
    );
  };
  let lo = MIN_FIT_PX;
  let hi = Math.max(lo, Math.floor(height));
  if (!fits(lo)) return null;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return Math.floor(lo * FIT_SAFETY);
}
