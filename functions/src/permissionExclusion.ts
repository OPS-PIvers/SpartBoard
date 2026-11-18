// A permission doc's exclude list beats every other rule, admins included; kept light so any gate can import it.

/** The doc's `excludedUsers`, trimmed, lowercased and de-duplicated. */
export const excludedEmails = (d: unknown): string[] => {
  const raw =
    d && typeof d === 'object'
      ? (d as { excludedUsers?: unknown }).excludedUsers
      : undefined;
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((e): e is string => typeof e === 'string')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
};

/** True when this email is on the doc's exclude list. */
export const isExcludedFrom = (
  d: unknown,
  email: string | null | undefined
): boolean => {
  const lower = (email ?? '').trim().toLowerCase();
  return !!lower && excludedEmails(d).includes(lower);
};
