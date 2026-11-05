/** Ordering item images, padded to `length`, or undefined when no item has one; non-https values are dropped. */
export function alignedOrderingImages(
  images: readonly string[] | undefined,
  length: number
): string[] | undefined {
  if (!images || images.length === 0) return undefined;
  const out = Array.from({ length }, (_, i) => {
    const url = images[i];
    return typeof url === 'string' && url.startsWith('https://') ? url : '';
  });
  return out.some(Boolean) ? out : undefined;
}
