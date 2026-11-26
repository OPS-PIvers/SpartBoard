/** Keys whose value differs from the seed; a removed key reads as null. */
export function changedSessionOptions(
  seed: Record<string, unknown>,
  now: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(seed), ...Object.keys(now)])) {
    if (JSON.stringify(seed[key]) !== JSON.stringify(now[key]))
      out[key] = now[key] ?? null;
  }
  return out;
}
