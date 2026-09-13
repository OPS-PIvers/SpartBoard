/** Native-language label for a BCP-47 tag (e.g. `es` -> `Español`), for override chips. */

/** Falls back to the tag itself when the runtime cannot name the language. */
export function languageNativeLabel(tag: string): string {
  const code = tag.trim();
  if (!code) return code;
  try {
    const label = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return label && label.toLowerCase() !== code.toLowerCase() ? label : code;
  } catch {
    return code;
  }
}
