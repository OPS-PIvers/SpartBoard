import type { SpeakLanguage } from '@/types';

// Speak likelihood scorer settings (S11 calibration round 2); defaults only, the gate's pass marks live in gate.config.json.

/** A sound is wrong when another sound makes the take this many nats likelier. */
export const SWAP_CUTOFF = 3.5;
/** A required sound-group partner is caught at this lead over the reference sound. */
export const REQUIRED_GROUP_CUTOFF = 1;
/** A forgiven group partner or tolerated sound explains the take at this lead (negative: even when slightly less likely). */
export const FORGIVEN_GROUP_CUTOFF = -1;
/** A wrong sound is read as a tolerated or forgiven partner when that partner is within this many nats of the best. */
export const CHARITABLE_WINDOW = 5;

const sounds = (list: string): readonly string[] => list.split(' ');

/** Sounds tried in place of each reference sound, per language (the prototype's inventory); the card's own sounds are added. */
export const SCORING_CANDIDATES: Readonly<
  Record<SpeakLanguage, readonly string[]>
> = {
  es: sounds(
    'n s t ə l a i k d m ɾ e p o ð f j b ɹ iː r w u ɡ ʃ h ŋ eɪ β uː oʊ eː θ oː ɣ x tʃ ʎ aː ɲ ja pː tː kː ʝ bː dː tʃː kʰ tʰ ɡː pʰ kʰː lː'
  ),
  de: sounds(
    'n s t ə l a i k d m ɛ ɾ e ɪ p z f v b ɹ ʊ iː r ɡ aɪ ʃ h ɔ ɑː ŋ ɚ uː eː aʊ ts oː ɜ ɑ əl x ɜː ç ɔː aː œ yː ɛː ɔø øː pː tː kː bː dː tsː ɡː ʊː iːː ɪː œː lː'
  ),
  en: sounds(
    'n s t ə l a i k d m ɛ ɾ e ɪ p ɐ z ð f j v b ɹ ʁ ʊ iː r w ʌ ɡ æ aɪ ʃ h ɑː ŋ ɚ eɪ uː oʊ eː θ aʊ əl ɜː tʃ ɔː ɑːɹ aː ɛː pː tː kː bː dː æː tʃː ɡː ʊː iːː ɪː lː'
  ),
};
