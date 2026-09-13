/** Native-language label for a BCP-47 tag (e.g. `es` -> `Español`), for override chips. */

// `Intl.DisplayNames` ships no ICU data for these and answers in English.
const NATIVE_LABELS: Record<string, string> = {
  es: 'Español',
  so: 'Soomaali',
  hmn: 'Hmoob',
};

/** Falls back to the tag itself when the runtime cannot name the language. */
export function languageNativeLabel(tag: string): string {
  const code = tag.trim();
  if (!code) return code;
  const known = NATIVE_LABELS[code.toLowerCase()];
  if (known) return known;
  try {
    const label = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return label && label.toLowerCase() !== code.toLowerCase() ? label : code;
  } catch {
    return code;
  }
}
