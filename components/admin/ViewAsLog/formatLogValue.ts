const ABSENT = '(none)';

/** Readable form of a logged value; timestamps (live or normalized) print as dates. */
export function formatLogValue(value: unknown): string {
  if (value === undefined) return ABSENT;
  return (
    JSON.stringify(
      value,
      (_k, v: unknown) => {
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (typeof o.__timestamp === 'number') {
            return new Date(o.__timestamp).toLocaleString();
          }
          if (typeof o.toMillis === 'function') {
            return new Date((o.toMillis as () => number)()).toLocaleString();
          }
        }
        return v;
      },
      2
    ) ?? ABSENT
  );
}
