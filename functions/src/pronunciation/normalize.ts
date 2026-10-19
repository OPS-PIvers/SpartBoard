// Brings this espeak build's IPA back to espeak-ng 1.51's conventions, the version the model's tokens and the spikes were measured on.
import type { SpeakLanguage } from './types';

const PRIMARY = 'ˈ';
const SECONDARY = 'ˌ';

export function normalizeEspeakIpa(
  ipa: string,
  language: SpeakLanguage
): string {
  let s = ipa;
  // Phonemizing without a clause leaves espeak's unstressed words with only a secondary mark; 1.51's CLI promoted it.
  if (!s.includes(PRIMARY) && s.includes(SECONDARY))
    s = s.replace(SECONDARY, PRIMARY);
  if (language === 'de') {
    // 1.51 wrote y (ʏ isn't a model token) and `??` for UR, which the tokenizer refuses until S11 says otherwise.
    s = s.replaceAll('ʏ', 'y').replaceAll('ʊɐ', '??');
  }
  // 1.51 always assimilated n before f (`imfoɾmasjˈon`).
  if (language === 'es') s = s.replaceAll('nf', 'mf');
  return s;
}
