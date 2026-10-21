// Writes district Speak word fixes and reads sounds-like spellings through the card lookup.
import { deleteField, doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { FlashcardSpeakReference, SpeakLanguage } from '@/types';
import { callLookup } from '@/components/widgets/Flashcards/speak/lookupSpeakReferences';
import {
  LANGUAGE_DIALECTS,
  SPEAK_WORD_FIXES_DOC,
  type SpeakWordFix,
} from '@/utils/pronunciation/wordFixes';

export type SaveSpeakWordFix = (
  key: string,
  fix: SpeakWordFix | null
) => Promise<void>;

/** Merges one word so another admin's fix to a different word survives; null removes it. */
export const saveSpeakWordFix: SaveSpeakWordFix = async (key, fix) => {
  await setDoc(
    doc(db, 'admin_settings', SPEAK_WORD_FIXES_DOC),
    { words: { [key]: fix ?? deleteField() }, updatedAt: Date.now() },
    { merge: true }
  );
};

export type ReadSpeakSpelling = (
  language: SpeakLanguage,
  spelling: string
) => Promise<FlashcardSpeakReference[] | null>;

/** Reads the spelling in every accent of the language, so the fix reaches every class's sets. */
export const readSpeakSpelling: ReadSpeakSpelling = async (
  language,
  spelling
) => {
  const out = await callLookup({
    voices: false,
    language,
    dialects: [...LANGUAGE_DIALECTS[language]],
    terms: [{ cardId: 'spelling', term: spelling }],
  });
  const speak = out.cards.spelling;
  if (!speak || speak.status === 'unavailable') return null;
  const refs = speak.refs
    .filter((ref) => ref.source !== 'voice' && ref.tokens.length > 0)
    .map((ref): FlashcardSpeakReference => ({
      dialect: ref.dialect,
      tokens: ref.tokens,
      stress: ref.stress,
      source: 'voice',
    }));
  return refs.length > 0 ? refs : null;
};
