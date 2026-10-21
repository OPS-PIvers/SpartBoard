// Admin "Words to check" across every Speak assignment, with Hear it and a practice run per word.
import React, {
  Suspense,
  lazy,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { Loader2, Mic, RefreshCw, Volume2 } from 'lucide-react';
import { functions } from '@/config/firebase';
import type {
  FlashcardCard,
  FlashcardSpeakStudentSettings,
  SpeakLanguage,
} from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import { Modal } from '@/components/common/Modal';
import { MemoryFlashcardAdapter } from '@/components/flashcards/adapters';
import {
  hearIt,
  hearItVoice,
  speechAvailable,
  subscribeVoices,
} from '@/utils/pronunciation/hearIt';

export interface SpeakWordToCheck {
  key: string;
  language: SpeakLanguage;
  term: string;
  definition: string;
  students: number;
  missed: number;
  assignments: number;
  card: FlashcardCard;
  termLanguage: string;
  definitionLanguage: string;
  settings: FlashcardSpeakStudentSettings & { locked?: boolean };
}

export interface SpeakWordsToCheckResult {
  asOf: number;
  assignments: number;
  truncated: boolean;
  words: SpeakWordToCheck[];
}

export type LoadSpeakWordsToCheck = () => Promise<SpeakWordsToCheckResult>;

const callList: LoadSpeakWordsToCheck = async () =>
  (
    await httpsCallable<Record<string, never>, SpeakWordsToCheckResult>(
      functions,
      'listSpeakWordsToCheckV1',
      // The server may take its full 120 s on a large district.
      { timeout: 125_000 }
    )({})
  ).data;

// The player is only needed once an admin opens a word.
const FlashcardPlayer = lazy(() =>
  import('@/components/flashcards/FlashcardPlayer').then((m) => ({
    default: m.FlashcardPlayer,
  }))
);

const smallButton =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40';

const voicesSnapshot = () =>
  speechAvailable() ? window.speechSynthesis.getVoices().length : 0;

const WordTryModal: React.FC<{
  word: SpeakWordToCheck;
  onClose: () => void;
}> = ({ word, onClose }) => {
  const [adapter] = useState(() => new MemoryFlashcardAdapter());
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={word.term}
      maxWidth="max-w-3xl"
      zIndex="z-modal-deep"
      contentClassName="px-6 pb-6"
    >
      <div
        className="overflow-hidden rounded-xl border border-slate-200"
        style={{ height: 'min(560px, 70vh)', containerType: 'size' }}
      >
        <Suspense fallback={null}>
          <FlashcardPlayer
            cards={[word.card]}
            termLanguage={word.termLanguage}
            definitionLanguage={word.definitionLanguage}
            adapter={adapter}
            speak={{ ...word.settings, example: true, locked: true }}
            allowedModes={['speak']}
          />
        </Suspense>
      </div>
    </Modal>
  );
};

export const FlashcardsSpeakWordsToCheck: React.FC<{
  load?: LoadSpeakWordsToCheck;
}> = ({ load = callList }) => {
  const { t } = useTranslation();
  const [result, setResult] = useState<SpeakWordsToCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [trying, setTrying] = useState<SpeakWordToCheck | null>(null);
  // Chrome fills the voice list in after load, so Hear it re-checks when it changes.
  useSyncExternalStore(subscribeVoices, voicesSnapshot, () => 0);

  const fetchWords = useEffectEvent(() => load());

  useEffect(() => {
    let live = true;
    fetchWords()
      .then((next) => {
        if (!live) return;
        setResult(next);
        setFailed(false);
      })
      .catch((err: unknown) => {
        console.error('[FlashcardsSpeakWordsToCheck] load:', err);
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const refresh = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const words = result?.words ?? [];

  return (
    <section className="space-y-3" data-testid="speak-words-to-check">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            {t('flashcards.speak.admin.wordsToCheck.title')}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {t('flashcards.speak.admin.wordsToCheck.intro')}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('flashcards.speak.admin.wordsToCheck.rule')}
          </p>
        </div>
        <button
          type="button"
          {...tourFieldAttr(
            'admin.widget-config.field',
            'flashcards',
            'speak-words-to-check-refresh'
          )}
          onClick={refresh}
          disabled={loading}
          className={smallButton}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden
          />
          {t('flashcards.speak.admin.wordsToCheck.refresh')}
        </button>
      </div>

      {failed && result && (
        <p className="text-sm font-medium text-brand-red-primary">
          {t('flashcards.speak.admin.wordsToCheck.failed')}
        </p>
      )}

      {loading && !result ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </div>
      ) : failed && !result ? (
        <p className="text-sm font-medium text-brand-red-primary">
          {t('flashcards.speak.admin.wordsToCheck.failed')}
        </p>
      ) : words.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t('flashcards.speak.admin.wordsToCheck.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {words.map((word) => {
            const dialect = word.settings.dialects?.[0] ?? word.termLanguage;
            const canHear = hearItVoice(dialect) !== null;
            return (
              <li
                key={word.key}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div
                    lang={word.termLanguage}
                    className="truncate text-sm font-bold text-slate-800"
                  >
                    {word.term}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {[
                      word.definition,
                      t(`flashcards.speak.admin.languages.${word.language}`),
                      t('flashcards.speak.admin.wordsToCheck.assignments', {
                        count: word.assignments,
                      }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <span className="text-sm font-black tabular-nums text-rose-700">
                  {t('flashcards.speak.admin.wordsToCheck.missed', {
                    missed: word.missed,
                    students: word.students,
                  })}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    {...tourFieldAttr(
                      'admin.widget-config.field',
                      'flashcards',
                      'speak-words-to-check-hear'
                    )}
                    disabled={!canHear}
                    onClick={() => hearIt(word.term, dialect)}
                    className={smallButton}
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden />
                    {t('flashcards.speak.player.hearIt')}
                  </button>
                  <button
                    type="button"
                    {...tourFieldAttr(
                      'admin.widget-config.field',
                      'flashcards',
                      'speak-words-to-check-say'
                    )}
                    onClick={() => setTrying(word)}
                    className={smallButton}
                  >
                    <Mic className="h-3.5 w-3.5" aria-hidden />
                    {t('flashcards.speak.admin.wordsToCheck.sayIt')}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {result?.truncated && (
        <p className="text-xs text-slate-500">
          {t('flashcards.speak.admin.wordsToCheck.truncated')}
        </p>
      )}

      {trying && <WordTryModal word={trying} onClose={() => setTrying(null)} />}
    </section>
  );
};
