function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The student's saved order as item indices, or null when it isn't a full order of these items. */
export function orderFromSaved(
  items: readonly string[],
  saved: string | null
): number[] | null {
  if (!saved) return null;
  const parts = saved.split('|');
  if (parts.length !== items.length) return null;
  const used = new Set<number>();
  const order: number[] = [];
  for (const part of parts) {
    const idx = items.findIndex((item, j) => item === part && !used.has(j));
    if (idx < 0) return null;
    used.add(idx);
    order.push(idx);
  }
  return order;
}

/** Saved order when there is one, else a fresh shuffle that isn't the authored order. */
export function startingOrder(
  items: readonly string[],
  saved: string | null
): number[] {
  const fromSaved = orderFromSaved(items, saved);
  if (fromSaved) return fromSaved;
  const order = shuffle(items.map((_, i) => i));
  // Never start in the authored (correct) order, or an untouched list would score.
  const solved = order.every((v, i) => items[v] === items[i]);
  return solved && order.length > 1 ? [...order.slice(1), order[0]] : order;
}
