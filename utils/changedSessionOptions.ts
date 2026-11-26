/** Keys whose value differs from the seed; a removed key reads as null. */
export function changedSessionOptions(
  seedOptions: object,
  nowOptions: object
): Record<string, unknown> {
  const seed: Record<string, unknown> = Object.fromEntries(
    Object.entries(seedOptions)
  );
  const now: Record<string, unknown> = Object.fromEntries(
    Object.entries(nowOptions)
  );
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(seed), ...Object.keys(now)])) {
    if (JSON.stringify(seed[key]) !== JSON.stringify(now[key]))
      out[key] = now[key] ?? null;
  }
  return out;
}
