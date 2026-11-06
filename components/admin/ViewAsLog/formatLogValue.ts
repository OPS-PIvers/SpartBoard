const ABSENT = '(none)';

/** Readable form of a logged value; timestamps (live or normalized) print as dates. */
export function formatLogValue(value: unknown): string {
  if (value === undefined) return ABSENT;
  return (
    JSON.stringify(
      value,
      function (this: Record<string, unknown>, k: string, v: unknown) {
        // toJSON runs before the replacer, so read the original holder value.
        const raw = k === '' ? value : this[k];
        if (raw && typeof raw === 'object') {
          const o = raw as Record<string, unknown>;
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
