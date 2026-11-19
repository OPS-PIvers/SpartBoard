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
  type BrowserSpeechEngine,
} from '@/utils/speechToText/browserEngine';
import { dictationLocaleFor } from '@/utils/speechToText/languages';
import { applyTextRules } from '@/utils/speechToText/textRules';
import { beginMicPermissionPrompt } from '@/utils/permissionPrompt';
import type {
  DictationController,
  DictationErrorCode,
  DictationStatus,
  UseDictationOptions,
} from '@/utils/speechToText/types';

const FALLBACK_LANGUAGE = 'en';

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

  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const engineRef = useRef<BrowserSpeechEngine | null>(null);
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
        const engine = (engineRef.current ??= createBrowserEngine());
        if (!engine) return;
        const id = ++sessionCounter.current;
        activeSession.current = id;
        const live = () => activeSession.current === id;
        const committed: string[] = [];
        let finished = false;

        setStatus('starting');
        setInterim('');
        if (!keepError) setError(null);

        engine.start(
          { locale: dictationLocaleFor(lang) ?? 'en-US' },
          {
            onStart: () => {
              if (live()) setStatus('listening');
            },
            onInterim: (text) => {
              if (live() && !finished) setInterim(text);
            },
            onFinal: (raw) => {
              if (!live() || finished) return;
              const current = latest.current;
              const phrase = applyTextRules(raw, {
                textBefore: current.textBefore
                  ? current.textBefore()
                  : committed.join(''),
                language: lang,
                punctuates: engine.punctuates,
              });
              setInterim('');
              if (phrase.kind === 'undo') {
                const last = committed.pop();
                if (last !== undefined) current.onUndo?.(last);
                return;
              }
              if (phrase.kind !== 'text') return;
              committed.push(phrase.text);
              current.onCommit(phrase.text);
              if (current.singlePhrase) {
                finished = true;
                engine.stop();
              }
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
    engineRef.current?.abort();
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
    engineRef.current?.stop();
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
