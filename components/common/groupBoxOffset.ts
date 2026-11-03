/** Moves the dashed group box with a group drag, which moves widgets outside React until the drop. */
export function setGroupBoxOffset(dx: number, dy: number): void {
  const el = document.querySelector<HTMLElement>('[data-group-bbox]');
  if (el) el.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
}
