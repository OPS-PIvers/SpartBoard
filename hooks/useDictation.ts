import {
  carryPunctuation,
  lacksPunctuation,
} from '@/utils/speechToText/carryPunctuation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createBrowserEngine,
  isBrowserEngineSupported,
} from '@/utils/speechToText/browserEngine';
import { createHybridEngine } from '@/utils/speechToText/hybridEngine';
import { isPaidTranscribeOff } from '@/utils/speechToText/paidCalls';
import { dictationLocaleFor } from '@/utils/speechToText/languages';
import { applyTextRules } from '@/utils/speechToText/textRules';
import { beginMicPermissionPrompt } from '@/utils/permissionPrompt';
import type {
  DictationController,
  DictationErrorCode,
  DictationStatus,
  SpeechEngine,
  UseDictationOptions,
} from '@/utils/speechToText/types';
import { useSpeechToTextSettings } from './useSpeechToTextSettings';

const FALLBACK_LANGUAGE = 'en';
const BROWSER_ENGINE = 'browser';

/** One committed phrase, kept so a paid revision or "undo that" can find it. */
interface CommittedPhrase {
  text: string;
  /** What stood before the caret when it was committed. */
  before: string;
  undone: boolean;
}

// The language a student picked carries to the next text box on the page.
let preferredLanguage: string | null = null;

/** Test hook: forget the language picked earlier on this page. */
export function resetDictationPreference(): void {
  preferredLanguage = null;
}

/** Speech to text for one text box: listens, tidies each phrase and hands it to the caller. Audio is never kept (D11). */
export function useDictation(
  options: UseDictationOptions
): DictationController {
  const [engineSupported] = useState(isBrowserEngineSupported);
  const supported = options.enabled && engineSupported;

  const [status, setStatus] = useState<DictationStatus>('idle');
  const [error, setError] = useState<DictationErrorCode | null>(null);
  const [interim, setInterim] = useState('');
  const [chosen, setChosen] = useState<string | null>(() => preferredLanguage);
  const [dropped, setDropped] = useState<readonly string[]>([]);

  const languageKey = options.languages.join(',');
  const languages = useMemo<readonly string[]>(() => {
    const offered = languageKey
      .split(',')
      .filter(
        (code) =>
          code !== '' &&
          dictationLocaleFor(code) !== null &&
          !dropped.includes(code)
      );
    return offered.length > 0 ? offered : [FALLBACK_LANGUAGE];
  }, [languageKey, dropped]);
  const language =
    chosen !== null && languages.includes(chosen) ? chosen : languages[0];

  // Signed-in students only (D15): the admin setting decides whether the paid engine runs.
  const paidSettings = useSpeechToTextSettings(
    options.enabled && options.paid !== undefined
  );
  const hybridFor =
    options.paid !== undefined && paidSettings.engine === 'hybrid'
      ? options.paid.assignmentId
      : null;

  const latest = useRef(options);
  const hybridRef = useRef(hybridFor);
  useLayoutEffect(() => {
    latest.current = options;
    hybridRef.current = hybridFor;
  });

  const engineRef = useRef<{ key: string; engine: SpeechEngine } | null>(null);
  const mounted = useRef(true);
  const sessionCounter = useRef(0);
  /** Id of the listening session in progress; 0 when idle. */
  const activeSession = useRef(0);
  /** Settles the mic prompt window the student's click opened. */
  const endPrompt = useRef<(() => void) | null>(null);
  const settlePrompt = useCallback(() => {
    endPrompt.current?.();
    endPrompt.current = null;
  }, []);

  const begin = useCallback(
    (first: string) => {
      const run = (lang: string, keepError: boolean): void => {
        const assignmentId = isPaidTranscribeOff() ? null : hybridRef.current;
        const key =
          assignmentId === null ? BROWSER_ENGINE : `hybrid:${assignmentId}`;
        if (engineRef.current && engineRef.current.key !== key) {
          activeSession.current = 0;
          engineRef.current.engine.abort();
          engineRef.current = null;
        }
        if (!engineRef.current) {
          const base = createBrowserEngine();
          if (!base) return;
          engineRef.current = {
            key,
            engine:
              assignmentId === null
                ? base
                : createHybridEngine(base, { assignmentId }),
          };
        }
        const engine = engineRef.current.engine;
        const id = ++sessionCounter.current;
        activeSession.current = id;
        const live = () => activeSession.current === id;
        const committed: CommittedPhrase[] = [];
        // One slot per phrase the engine finished, in order, so a revision finds its phrase.
        const finals: (CommittedPhrase | null)[] = [];
        let finished = false;

        setStatus('starting');
        setInterim('');
        if (!keepError) setError(null);

        engine.start(
          { locale: dictationLocaleFor(lang) ?? 'en-US', language: lang },
          {
            onStart: () => {
              if (live()) setStatus('listening');
            },
            onInterim: (text) => {
              if (live() && !finished) setInterim(text);
            },
            onFinal: (raw) => {
              const slot = finals.push(null) - 1;
              if (!live() || finished) return;
              const current = latest.current;
              const before = current.textBefore
                ? current.textBefore()
                : committed.map((c) => c.text).join('');
              const phrase = applyTextRules(raw, {
                textBefore: before,
                language: lang,
                punctuates: engine.punctuates,
              });
              setInterim('');
              if (phrase.kind === 'undo') {
                const last = committed.pop();
                if (last === undefined) return;
                last.undone = true;
                current.onUndo?.(last.text);
                return;
              }
              if (phrase.kind !== 'text') return;
              const entry = { text: phrase.text, before, undone: false };
              committed.push(entry);
              finals[slot] = entry;
              current.onCommit(phrase.text);
              if (current.singlePhrase) {
                finished = true;
                engine.stop();
              }
            },
            // May arrive after listening stopped; the phrase is still worth fixing.
            onRevise: (slot, raw) => {
              const entry = finals[slot];
              if (!entry || entry.undone || !mounted.current) return;
              // The model punctuates, so spoken punctuation rules stay off.
              const phrase = applyTextRules(raw, {
                textBefore: entry.before,
                language: lang,
                punctuates: true,
              });
              if (phrase.kind !== 'text') return;
              // An exact-words transcript has no punctuation; keep what the free engine placed.
              if (lacksPunctuation(raw))
                phrase.text = carryPunctuation(entry.text, phrase.text);
              if (phrase.text === entry.text) return;
              const previous = entry.text;
              entry.text = phrase.text;
              latest.current.onRevise?.(previous, phrase.text);
            },
            onError: (code) => {
              if (!live()) return;
              settlePrompt();
              setError(code);
              if (code !== 'language-unsupported' || lang === FALLBACK_LANGUAGE)
                return;
              // D12: carry on in English and stop offering this language.
              setDropped((list) =>
                list.includes(lang) ? list : [...list, lang]
              );
              setChosen(FALLBACK_LANGUAGE);
              run(FALLBACK_LANGUAGE, true);
            },
            onEnd: () => {
              if (!live()) return;
              settlePrompt();
              activeSession.current = 0;
              setStatus('idle');
              setInterim('');
            },
          }
        );
      };
      run(first, false);
    },
    [settlePrompt]
  );

  const halt = useCallback(() => {
    settlePrompt();
    if (activeSession.current === 0) return;
    activeSession.current = 0;
    engineRef.current?.engine.abort();
    setStatus('idle');
    setInterim('');
  }, [settlePrompt]);

  const start = useCallback(() => {
    if (!supported || activeSession.current !== 0) return;
    settlePrompt();
    // The first listen can show the browser's mic prompt, which must not count as leaving the tab.
    endPrompt.current = beginMicPermissionPrompt();
    begin(language);
  }, [supported, language, begin, settlePrompt]);

  const stop = useCallback(() => {
    if (activeSession.current === 0) return;
    engineRef.current?.engine.stop();
  }, []);

  const toggle = useCallback(() => {
    if (activeSession.current !== 0) stop();
    else start();
  }, [start, stop]);

  const setLanguage = useCallback(
    (code: string) => {
      if (!languages.includes(code)) return;
      preferredLanguage = code;
      setChosen(code);
      if (activeSession.current !== 0 && code !== language) begin(code);
    },
    [languages, language, begin]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!supported) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') halt();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      halt();
    };
  }, [supported, halt]);

  return {
    supported,
    status: supported ? status : 'idle',
    error,
    interim,
    language,
    languages,
    setLanguage,
    start,
    stop,
    toggle,
  };
}
