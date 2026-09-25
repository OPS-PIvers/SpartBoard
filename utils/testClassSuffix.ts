const TRAILING_TEST_SUFFIXES = /(\s*\(test\))+\s*$/i;
const FIRST_TRAILING_TEST_SUFFIX = /\s*(\(test\))(?:\s*\(test\))*\s*$/i;

/** D48 — appends " (test)" to a test-class title unless it already ends with one. */
export function withTestSuffix(title: string): string {
  const trimmed = title.trim();
  return TRAILING_TEST_SUFFIXES.test(trimmed) ? trimmed : `${trimmed} (test)`;
}

/** D48 — collapses repeated trailing "(test)" suffixes left by the old import into one. */
export function collapseTestSuffix(name: string): string {
  if (!TRAILING_TEST_SUFFIXES.test(name)) return name;
  return name.replace(FIRST_TRAILING_TEST_SUFFIX, ' $1');
}
