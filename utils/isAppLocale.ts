// Shared app-shell locale test so chrome-translation notes stay in sync with i18n.
import { SUPPORTED_LANGUAGES } from '@/i18n';

export function isAppLocale(code: string | undefined | null): boolean {
  return !!code && SUPPORTED_LANGUAGES.some((l) => l.code === code);
}
