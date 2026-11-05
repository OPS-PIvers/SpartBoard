import { useContext, useEffect, useState } from 'react';
import type {
  FlashcardCard,
  FlashcardSet,
  FlashcardSpeakSettings,
  FlashcardsSpeakAdminConfig,
  SpeakDialect,
  SpeakLanguage,
} from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { speakLanguageOf } from '@/config/pronunciationGroups';
import { readFlashcardsSpeakAdminConfig } from '@/hooks/useFlashcardSets';
import {
  attachSpeakReferences,
  cardsNeedingLookup,
  type SpeakLookupCall,
} from './speak/lookupSpeakReferences';
import {
  initialSpeakSettings,
  settingsFitLanguage,
  speakForTerm,
  type SpeakIpaDrafts,
} from './speak/speakEditorState';
import { useVoiceFillProgress } from './speak/speakVoiceFill';
import type { SpeakIpaOverride } from '@/utils/pronunciation/ipaReadings';

export const MAX_FLASHCARDS_PER_SET = 500;

export interface SpeakRowProps {
  dialects: readonly SpeakDialect[];
  ipaDrafts: SpeakIpaDrafts;
  onIpaChange: (cardId: string, ipa: SpeakIpaOverride) => void;
  onConfirm: (cardId: string) => void;
}

export const newFlashcard = (): FlashcardCard => ({
  id: crypto.randomUUID(),
  term: '',
  definition: '',
});

/** Trimmed cards with stale references dropped and fully empty rows left out. */
export const cleanFlashcards = (cards: FlashcardCard[]): FlashcardCard[] =>
  cards
    .map((card) => {
      const term = card.term.trim();
      const next = { ...card, term, definition: card.definition.trim() };
      // References belong to the term they were computed for.
      if (next.speak && next.speak.term !== term) delete next.speak;
      return next;
    })
    .filter((card) => card.term !== '' || card.definition !== '');

/** What still has to be filled in before a set can be used, or null. */
export const flashcardSetIncompleteReason = ({
  title,
  cards,
}: Pick<FlashcardSet, 'title' | 'cards'>): string | null => {
  if (!title.trim()) return 'Set title is required';
  const filled = cleanFlashcards(cards);
  if (filled.length === 0) return 'Add at least one card';
  const index = filled.findIndex((card) => !card.term || !card.definition);
  if (index < 0) return null;
  return filled[index].term
    ? `Card ${index + 1}: definition is required`
    : `Card ${index + 1}: term is required`;
};

/** Draft state shared by the Flashcards set editors (classic page and Quiz-style dialog). */
export const useFlashcardEditorState = (
  initialSet: FlashcardSet,
  speakLookup?: SpeakLookupCall
) => {
  const canSpeak =
    useContext(AuthContext)?.canAccessFeature('flashcards-speak') ?? false;
  const [title, setTitle] = useState(initialSet.title);
  const [description, setDescription] = useState(initialSet.description ?? '');
  const [targets, setTargets] = useState(initialSet.targets);
  const [termLanguage, setTermLanguage] = useState(initialSet.termLanguage);
  const [definitionLanguage, setDefinitionLanguage] = useState(
    initialSet.definitionLanguage
  );
  const [cards, setCards] = useState<FlashcardCard[]>(
    initialSet.cards.length > 0
      ? initialSet.cards
      : [newFlashcard(), newFlashcard()]
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speakAdmin, setSpeakAdmin] =
    useState<FlashcardsSpeakAdminConfig | null>(null);
  // Speak settings the teacher has touched, keyed by the language they were made for.
  const [speakEdit, setSpeakEdit] = useState<{
    language: SpeakLanguage;
    settings: FlashcardSpeakSettings;
  } | null>(null);
  const [ipaDrafts, setIpaDrafts] = useState<SpeakIpaDrafts>({});
  const [checkingCount, setCheckingCount] = useState(0);

  const speakLanguage = canSpeak ? speakLanguageOf(termLanguage) : null;
  const voiceFill = useVoiceFillProgress().get(initialSet.id);

  useEffect(() => {
    if (!canSpeak) return;
    let cancelled = false;
    void readFlashcardsSpeakAdminConfig().then((config) => {
      if (!cancelled) setSpeakAdmin(config);
    });
    return () => {
      cancelled = true;
    };
  }, [canSpeak]);

  const savedSpeak =
    speakLanguage && settingsFitLanguage(initialSet.speak, speakLanguage)
      ? initialSet.speak
      : undefined;
  const speakSettings: FlashcardSpeakSettings | null = !speakLanguage
    ? null
    : speakEdit?.language === speakLanguage
      ? speakEdit.settings
      : speakAdmin
        ? initialSpeakSettings(termLanguage, savedSpeak, speakAdmin)
        : null;
  const speakOn = speakLanguage !== null && speakSettings !== null;

  const setSpeakSettings = (settings: FlashcardSpeakSettings): void => {
    if (speakLanguage) setSpeakEdit({ language: speakLanguage, settings });
  };

  const confirmSpeakCard = (id: string): void => {
    setCards((current) =>
      current.map((card) => {
        const speak = speakForTerm(card);
        return card.id === id && speak
          ? { ...card, speak: { ...speak, confirmedAt: Date.now() } }
          : card;
      })
    );
  };

  const speakRow: SpeakRowProps | null =
    speakOn && speakSettings
      ? {
          dialects: speakSettings.dialects,
          ipaDrafts,
          onIpaChange: (cardId, ipa) => {
            const term = cards.find((card) => card.id === cardId)?.term ?? '';
            setIpaDrafts((current) => ({
              ...current,
              [cardId]: { term: term.trim(), ipa },
            }));
          },
          onConfirm: confirmSpeakCard,
        }
      : null;

  const updateCard = (id: string, updates: Partial<FlashcardCard>): void => {
    setCards((current) =>
      current.map((card) => (card.id === id ? { ...card, ...updates } : card))
    );
  };

  /** Inserts a blank card after `index`; null when the set is full. */
  const insertCardAfter = (index: number): FlashcardCard | null => {
    if (cards.length >= MAX_FLASHCARDS_PER_SET) {
      setNotice('A set can contain up to 500 cards.');
      return null;
    }
    const card = newFlashcard();
    setCards((current) => [
      ...current.slice(0, index + 1),
      card,
      ...current.slice(index + 1),
    ]);
    return card;
  };

  const removeCard = (id: string): void => {
    setCards((current) =>
      current.length === 1
        ? [{ ...current[0], term: '', definition: '' }]
        : current.filter((entry) => entry.id !== id)
    );
  };

  /** Appends cards, replacing an untouched starter list; keeps the first 500. */
  const appendCards = (incoming: FlashcardCard[]): void => {
    setCards((current) => {
      const withoutEmptyStarter = current.every(
        (card) => !card.term && !card.definition
      )
        ? []
        : current;
      const combined = [...withoutEmptyStarter, ...incoming];
      if (combined.length > MAX_FLASHCARDS_PER_SET) {
        setNotice('Only the first 500 cards were kept.');
      }
      return combined.slice(0, MAX_FLASHCARDS_PER_SET);
    });
  };

  /** True when saving these cards would run a Speak reference lookup. */
  const needsLookup = (cleaned: FlashcardCard[]): boolean =>
    !!speakOn &&
    !!speakSettings &&
    cardsNeedingLookup(cleaned, speakSettings.dialects, ipaDrafts).length > 0;

  /** Runs the Speak reference lookup for cards that need one, and keeps the result in the draft. */
  const lookupReferences = async (
    cleaned: FlashcardCard[]
  ): Promise<FlashcardCard[]> => {
    if (!speakOn || !speakLanguage || !speakSettings) return cleaned;
    const pending = cardsNeedingLookup(
      cleaned,
      speakSettings.dialects,
      ipaDrafts
    ).length;
    if (pending === 0) return cleaned;
    setCheckingCount(pending);
    let looked: FlashcardCard[];
    try {
      looked = await attachSpeakReferences(
        cleaned,
        speakLanguage,
        speakSettings.dialects,
        ipaDrafts,
        speakLookup
      );
    } finally {
      setCheckingCount(0);
    }
    setCards(looked);
    setIpaDrafts({});
    return looked;
  };

  /** The set as it would be saved with these cards. */
  const composeSet = (savedCards: FlashcardCard[]): FlashcardSet => {
    // F22: a set keeps the district defaults until its own Speak settings are first changed.
    const speak = !speakOn
      ? initialSet.speak
      : speakSettings && (speakEdit?.language === speakLanguage || savedSpeak)
        ? speakSettings
        : undefined;
    const {
      speak: _previousSpeak,
      targets: _previousTargets,
      ...rest
    } = initialSet;
    return {
      ...rest,
      ...(speak ? { speak } : {}),
      ...(targets?.length ? { targets } : {}),
      title: title.trim(),
      description: description.trim(),
      termLanguage: termLanguage.trim() || 'en-US',
      definitionLanguage: definitionLanguage.trim() || 'en-US',
      cards: savedCards.slice(0, MAX_FLASHCARDS_PER_SET),
      updatedAt: Date.now(),
    };
  };

  return {
    canSpeak,
    title,
    setTitle,
    description,
    setDescription,
    targets,
    setTargets,
    termLanguage,
    setTermLanguage,
    definitionLanguage,
    setDefinitionLanguage,
    cards,
    setCards,
    error,
    setError,
    notice,
    setNotice,
    speakLanguage,
    speakSettings,
    setSpeakSettings,
    speakOn,
    speakRow,
    speakEdit,
    ipaDrafts,
    confirmSpeakCard,
    checkingCount,
    voiceFill,
    updateCard,
    insertCardAfter,
    removeCard,
    appendCards,
    needsLookup,
    lookupReferences,
    composeSet,
  };
};

export type FlashcardEditorState = ReturnType<typeof useFlashcardEditorState>;
