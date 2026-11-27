/** Keys whose value differs from the seed, treating absent and null as equal; a removed key reads as undefined. */
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
    if (JSON.stringify(seed[key] ?? null) !== JSON.stringify(now[key] ?? null))
      out[key] = now[key] ?? undefined;
  }
  return out;
}
