// Editor side of Flashcards Speak (docs/multilingual-pronunciation-engine.md F11, §4.3, S8): pure state helpers.
import type {
  FlashcardCard,
  FlashcardCardSpeak,
  FlashcardSpeakReason,
  FlashcardSpeakSettings,
  FlashcardsSpeakAdminConfig,
  SpeakDialect,
  SpeakGroupSetting,
  SpeakLanguage,
  SpeakPreset,
} from '@/types';
import {
  SPEAK_DIALECTS,
  speakPresetSettings,
} from '@/config/pronunciationGroups';
import { buildSpeakStamp } from '../utils/flashcardAssign';
import { tokenizeIpa } from '@/utils/pronunciation/tokenizeIpa';
import { SPEAK_G2P_VERSION } from '@/utils/pronunciation/g2pVersion';

/** Unsaved IPA per card id, tied to the term it was typed for. */
export type SpeakIpaDrafts = Record<
  string,
  { term: string; ipa: Partial<Record<SpeakDialect, string>> }
>;

/** The card's draft IPA, unless its term changed since it was typed. */
export const ipaDraftFor = (
  card: FlashcardCard,
  drafts: SpeakIpaDrafts
): Partial<Record<SpeakDialect, string>> | undefined => {
  const draft = drafts[card.id];
  return draft && draft.term === card.term.trim() ? draft.ipa : undefined;
};

/** The set's own settings, else the district defaults for the language (F22). */
export function initialSpeakSettings(
  termLanguage: string,
  own: FlashcardSpeakSettings | undefined,
  adminConfig: FlashcardsSpeakAdminConfig
): FlashcardSpeakSettings | null {
  const stamp = buildSpeakStamp(
    { termLanguage, speak: own },
    true,
    adminConfig,
    false
  );
  if (!stamp) return null;
  const {
    locked: _locked,
    unclearConfidence: _unclearConfidence,
    ...settings
  } = stamp;
  return settings;
}

/** True when saved settings belong to this language (their dialects are its dialects). */
export const settingsFitLanguage = (
  settings: FlashcardSpeakSettings | undefined,
  language: SpeakLanguage
): boolean =>
  !!settings &&
  settings.dialects.length > 0 &&
  settings.dialects.every((d) => SPEAK_DIALECTS[language].includes(d));

export function applySpeakPreset(
  settings: FlashcardSpeakSettings,
  language: SpeakLanguage,
  preset: SpeakPreset
): FlashcardSpeakSettings {
  if (preset === 'custom') return { ...settings, preset };
  return { ...settings, preset, ...speakPresetSettings(language, preset) };
}

/** Changing one group row moves the preset to custom (§4.3). */
export const setSpeakGroup = (
  settings: FlashcardSpeakSettings,
  groupId: string,
  value: SpeakGroupSetting
): FlashcardSpeakSettings =>
  settings.groups[groupId] === value
    ? settings
    : {
        ...settings,
        preset: 'custom',
        groups: { ...settings.groups, [groupId]: value },
      };

/** A Strict value the preset doesn't define also moves it to custom. */
export const setSpeakStrict = (
  settings: FlashcardSpeakSettings,
  strict: boolean
): FlashcardSpeakSettings => {
  const presetStrict =
    settings.preset === 'custom' ? null : settings.preset === 'advanced';
  return {
    ...settings,
    strict,
    preset:
      presetStrict === null || presetStrict === strict
        ? settings.preset
        : 'custom',
  };
};

/** The card's references were computed for its current term. */
export const speakForTerm = (
  card: FlashcardCard
): FlashcardCardSpeak | undefined =>
  card.speak && card.speak.term === card.term ? card.speak : undefined;

const sameOverride = (
  a: Partial<Record<SpeakDialect, string>> | undefined,
  b: Partial<Record<SpeakDialect, string>> | undefined
): boolean => {
  const clean = (o: Partial<Record<SpeakDialect, string>> | undefined) =>
    Object.entries(o ?? {})
      .map(([k, v]) => [k, (v ?? '').trim()] as const)
      .filter(([, v]) => v !== '')
      .sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
};

/** The override to send for a card: the teacher's draft, else the saved one. */
export function effectiveIpaOverride(
  card: FlashcardCard,
  drafts: SpeakIpaDrafts,
  dialects: readonly SpeakDialect[]
): Partial<Record<SpeakDialect, string>> | undefined {
  const source = ipaDraftFor(card, drafts) ?? speakForTerm(card)?.ipaOverride;
  const out: Partial<Record<SpeakDialect, string>> = {};
  for (const dialect of dialects) {
    const ipa = source?.[dialect]?.trim();
    if (ipa) out[dialect] = ipa;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const NO_REF_REASONS: readonly FlashcardSpeakReason[] = [
  'unrenderable',
  'untokenizable',
  'multi-word',
];

/** The references were looked up for these accents; an accent that failed for a recorded reason counts. */
export const refsFitDialects = (
  speak: FlashcardCardSpeak,
  dialects: readonly SpeakDialect[]
): boolean =>
  speak.refs.every((ref) => dialects.includes(ref.dialect)) &&
  (Array.isArray(speak.dialects)
    ? dialects.every((d) => speak.dialects?.includes(d))
    : // Saved before lookups recorded their accents: a card with no refs can't say which it covered.
      speak.refs.length > 0 &&
      (dialects.every((d) =>
        speak.refs.some((ref) => ref.dialect === d && ref.source !== 'voice')
      ) ||
        // A language has at most two accents, so a recorded failure explains the missing one.
        (speak.reasons ?? []).some((r) => NO_REF_REASONS.includes(r))));

/** A card needs a lookup when its term, accents, IPA or the engine changed, or the last lookup failed. */
export function cardNeedsLookup(
  card: FlashcardCard,
  dialects: readonly SpeakDialect[],
  drafts: SpeakIpaDrafts
): boolean {
  const speak = speakForTerm(card);
  if (!speak || !Array.isArray(speak.refs)) return true;
  if (speak.reasons?.includes('lookup-failed')) return true;
  if (speak.g2pVersion !== SPEAK_G2P_VERSION) return true;
  if (!refsFitDialects(speak, dialects)) return true;
  if (speak.refs.length === 0 && speak.status !== 'unavailable') return true;
  return !sameOverride(
    effectiveIpaOverride(card, drafts, dialects),
    speak.ipaOverride
  );
}

/** Keeps the teacher's IPA so the retry on the next save still sends it. */
export const lookupFailedSpeak = (
  card: FlashcardCard,
  g2pVersion = '',
  ipaOverride?: Partial<Record<SpeakDialect, string>>
): FlashcardCardSpeak => ({
  term: card.term,
  refs: [],
  g2pVersion,
  status: 'unavailable',
  reasons: ['lookup-failed'],
  ...(ipaOverride ? { ipaOverride } : {}),
});

// Voice readings ride along with their accent's espeak reference, so they never change what the teacher confirmed.
const espeakRefs = (speak: FlashcardCardSpeak) =>
  speak.refs.filter((ref) => ref.source !== 'voice');

/** A teacher's confirmation survives a re-lookup that returns the same references. */
export const keepSpeakConfirmation = (
  previous: FlashcardCardSpeak | undefined,
  next: FlashcardCardSpeak
): FlashcardCardSpeak =>
  previous?.confirmedAt &&
  previous.term === next.term &&
  next.status === 'needs-review' &&
  JSON.stringify(espeakRefs(previous)) === JSON.stringify(espeakRefs(next))
    ? { ...next, confirmedAt: previous.confirmedAt }
    : next;

/** Needs-review cards the teacher hasn't confirmed yet. */
export const cardNeedsCheck = (card: FlashcardCard): boolean => {
  const speak = speakForTerm(card);
  return speak?.status === 'needs-review' && !speak.confirmedAt;
};

/** Mirrors the server's override cleanup, so the editor flags what the lookup would reject. */
export const ipaOverrideValid = (ipa: string): boolean =>
  ipa.trim() === '' ||
  tokenizeIpa(ipa.replace(/[/[\].]/g, '').replaceAll('ʏ', 'y')).ok;
