import React, {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Download,
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  Save,
  Square,
  Star,
  Volume2,
} from 'lucide-react';
import type {
  FlashcardCard,
  FlashcardSpeakReference,
  FlashcardSpeakStudentSettings,
  RecordingConfig,
  SpeakLanguage,
} from '@/types';
import { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';
import {
  defaultAudioRecordingDeps,
  useAudioRecording,
  type AudioRecordingDeps,
  type AudioTake,
} from '@/hooks/useAudioRecording';
import {
  RecognizerError,
  defaultModelUrls,
  getRecognizer,
  type RecognizerState,
} from '@/utils/pronunciation/recognizer';
import { findCachedModel } from '@/utils/pronunciation/modelCache';
import {
  hearIt,
  hearItVoice,
  subscribeVoices,
} from '@/utils/pronunciation/hearIt';
import type { SpeakJudgement } from '@/utils/pronunciation/verdict';
import { heardReferences } from '@/utils/pronunciation/wordFixes';
import XLSR53_VOCAB from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import type { FlashcardSpeakTally } from '@/utils/flashcardSchedule';
import { RoundSummary } from './PlayerPrimitives';
import { cx } from './playerUtils';
import { LevelMeter, LiveLevelMeter } from './speak/LevelMeter';
import { useMicLevel } from './speak/useMicLevel';
import { useSpeechEnd } from './speak/useSpeechEnd';
import { SpeakMarks } from './speak/SpeakMarks';
import {
  canCapture,
  frameAllowsMic,
  isChromeOs,
  micPermission,
  reasonFromMicState,
  type MicPermission,
  type SpeakBlockReason,
} from './speak/micAccess';
import {
  cardRefs,
  judgeTake,
  judgedRef,
  letterSegments,
  speakMarks,
  spokenWord,
  stressSyllables,
} from './speak/speakJudge';

// A single word fits well inside 8 seconds; the hook stops the take at the limit.
const SPEAK_RECORDING: RecordingConfig = {
  prepSeconds: 0,
  limitSeconds: 8,
  prepExpiry: 'armed',
  takeLimit: null,
};
// F25: the Chromebook gate measured these; noise suppression smears consonants.
const SPEAK_BITS_PER_SECOND = 128000;
const SPEAK_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
};
const UNCLEAR_BEFORE_MIC_CHECK = 3;
const MIC_CHECK_WORD: Record<SpeakLanguage, string> = {
  es: 'hola',
  de: 'hallo',
  en: 'hello',
};
const HEARD_LEVEL = 0.15;

export interface SpeakModeProps {
  cards: FlashcardCard[];
  round: number;
  language: SpeakLanguage;
  settings: FlashcardSpeakStudentSettings;
  framed: boolean;
  starred: string[];
  showMarks: boolean;
  dark: boolean;
  onRecord: (
    cardId: string,
    passed: boolean,
    accuracy: number,
    tries: number,
    tally: FlashcardSpeakTally
  ) => void;
  onStar: (cardId: string) => void;
  onNextRound: () => void;
  onRestart?: () => void;
  /** Keyboard shortcuts pause while the settings drawer is open. */
  paused?: boolean;
  /** Admin Say it only: saves what the recognizer heard as another accepted reading. */
  onSaveHeard?: (
    cardId: string,
    refs: FlashcardSpeakReference[]
  ) => Promise<void>;
}

type Phase =
  | { kind: 'armed' }
  | { kind: 'permission' }
  | { kind: 'checking' }
  | { kind: 'unclear' }
  | { kind: 'mic-check' }
  | {
      kind: 'result';
      judgement: SpeakJudgement;
      decided: boolean;
      passed: boolean;
      heard: string[];
    };

const sizeLabel = (bytes: number): string => `${Math.round(bytes / 1e6)} MB`;

const SLOT = '\u0000';
/** Text before and after a placeholder, so a translated sentence can wrap rich content. */
const aroundSlot = (text: string): [string, string] => {
  const [before, after = ''] = text.split(SLOT);
  return [before, after];
};

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** The Speak study mode (plan §4.4, §4.5, F5, F12, F23-F29); scoring stays on the device. */
export const SpeakMode: React.FC<SpeakModeProps> = (props) => {
  const recognizer = getRecognizer();
  const state = useSyncExternalStore(
    (cb) => recognizer.subscribe(() => cb()),
    () => recognizer.state()
  );
  const [cacheChecked, setCacheChecked] = useState(false);

  useEffect(() => {
    if (recognizer.state().kind !== 'idle') return undefined;
    let cancelled = false;
    void findCachedModel(defaultModelUrls())
      .catch(() => null)
      .then((cached) => {
        if (cancelled) return;
        // F28: a cached model starts on its own; a first download waits for the student's tap.
        if (cached) void recognizer.prepare({ allowMetered: false });
        else setCacheChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [recognizer]);

  if (state.kind === 'ready') return <SpeakPractice {...props} />;
  return (
    <SpeakSetup
      dark={props.dark}
      state={state}
      waitingForTap={state.kind === 'idle' && cacheChecked}
      onPrepare={(allowMetered) => void recognizer.prepare({ allowMetered })}
    />
  );
};

const Panel: React.FC<{
  dark: boolean;
  tone?: 'neutral' | 'emerald' | 'rose';
  role?: 'status' | 'alert';
  children: React.ReactNode;
}> = ({ dark, tone = 'neutral', role, children }) => (
  <div
    role={role}
    className={cx(
      'w-full rounded-[min(22px,5cqmin)] border text-center',
      tone === 'emerald'
        ? dark
          ? 'border-emerald-300/25 bg-emerald-950/35 text-white'
          : 'border-emerald-200 bg-emerald-50 text-emerald-950'
        : tone === 'rose'
          ? dark
            ? 'border-rose-300/25 bg-rose-950/35 text-white'
            : 'border-rose-200 bg-rose-50 text-rose-950'
          : dark
            ? 'border-white/15 bg-slate-950/55 text-white'
            : 'border-slate-200 bg-white text-slate-900'
    )}
    style={{ padding: 'min(18px, 4cqmin)' }}
  >
    {children}
  </div>
);

const PanelTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="font-black" style={{ fontSize: 'min(15px, 3.8cqmin)' }}>
    {children}
  </p>
);

const PanelBody: React.FC<{ dark: boolean; children: React.ReactNode }> = ({
  dark,
  children,
}) => (
  <p
    className={dark ? 'text-white/80' : 'text-slate-700'}
    style={{ marginTop: 'min(6px, 1.5cqmin)', fontSize: 'min(13px, 3.4cqmin)' }}
  >
    {children}
  </p>
);

const primaryButton =
  'inline-flex items-center justify-center rounded-full bg-rose-600 font-black text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-45';
const secondaryButton = (dark: boolean) =>
  cx(
    'inline-flex items-center justify-center rounded-full font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300',
    dark
      ? 'bg-white/10 text-white hover:bg-white/20'
      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
  );
const buttonStyle: React.CSSProperties = {
  gap: 'min(7px, 1.5cqmin)',
  padding: 'min(10px, 2.4cqmin) min(18px, 4cqmin)',
  fontSize: 'min(12px, 3.2cqmin)',
};
const iconStyle: React.CSSProperties = {
  width: 'min(16px, 3.8cqmin)',
  height: 'min(16px, 3.8cqmin)',
};

const ButtonRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="flex flex-wrap items-center justify-center"
    style={{ gap: 'min(9px, 2cqmin)', marginTop: 'min(12px, 3cqmin)' }}
  >
    {children}
  </div>
);

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="mx-auto flex h-full min-h-0 w-full max-w-xl flex-col items-center justify-center bg-transparent"
    style={{ gap: 'min(14px, 3cqmin)' }}
  >
    {children}
  </div>
);

const SpeakSetup: React.FC<{
  dark: boolean;
  state: RecognizerState;
  waitingForTap: boolean;
  onPrepare: (allowMetered: boolean) => void;
}> = ({ dark, state, waitingForTap, onPrepare }) => {
  const { t } = useTranslation();
  const size = sizeLabel(PRONUNCIATION_MODEL.bytes);
  if (state.kind === 'unsupported') {
    return (
      <SpeakBlocked
        dark={dark}
        reason={state.reason}
        onRetry={
          state.reason === 'download-failed'
            ? () => onPrepare(false)
            : undefined
        }
      />
    );
  }
  if (state.kind === 'downloading') {
    const percent =
      state.total > 0 ? Math.floor((state.loaded / state.total) * 100) : 0;
    return (
      <Centered>
        <Panel dark={dark} role="status">
          <PanelTitle>
            {t('flashcards.speak.setup.downloading', { percent })}
          </PanelTitle>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t('flashcards.speak.setup.title')}
            className={cx(
              'mx-auto overflow-hidden rounded-full',
              dark ? 'bg-white/15' : 'bg-slate-200'
            )}
            style={{
              marginTop: 'min(12px, 3cqmin)',
              height: 'min(8px, 1.8cqmin)',
              maxWidth: 'min(320px, 70cqmin)',
            }}
          >
            <div
              className="h-full rounded-full bg-rose-600 transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
        </Panel>
      </Centered>
    );
  }
  if (state.kind === 'needs-download') {
    return (
      <Centered>
        <Panel dark={dark}>
          <PanelTitle>{t('flashcards.speak.setup.meteredTitle')}</PanelTitle>
          <PanelBody dark={dark}>
            {t('flashcards.speak.setup.meteredBody', { size })}
          </PanelBody>
          <ButtonRow>
            {/* no-tour-anchor: student player */}
            <button
              type="button"
              onClick={() => onPrepare(true)}
              className={primaryButton}
              style={buttonStyle}
            >
              <Download aria-hidden="true" style={iconStyle} />
              {t('flashcards.speak.setup.meteredConfirm')}
            </button>
          </ButtonRow>
        </Panel>
      </Centered>
    );
  }
  if (waitingForTap) {
    return (
      <Centered>
        <Panel dark={dark}>
          <PanelTitle>{t('flashcards.speak.setup.title')}</PanelTitle>
          <PanelBody dark={dark}>
            {t('flashcards.speak.setup.body', { size })}
          </PanelBody>
          <ButtonRow>
            {/* no-tour-anchor: student player */}
            <button
              type="button"
              onClick={() => onPrepare(false)}
              className={primaryButton}
              style={buttonStyle}
            >
              <Download aria-hidden="true" style={iconStyle} />
              {t('flashcards.speak.setup.download', { size })}
            </button>
          </ButtonRow>
        </Panel>
      </Centered>
    );
  }
  return (
    <Centered>
      <p
        role="status"
        className={cx(
          'inline-flex items-center font-bold',
          dark ? 'text-white/85' : 'text-slate-700'
        )}
        style={{ gap: 'min(8px, 2cqmin)', fontSize: 'min(13px, 3.4cqmin)' }}
      >
        <Loader2
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
          style={iconStyle}
        />
        {t('flashcards.speak.setup.starting')}
      </p>
    </Centered>
  );
};

const BLOCK_COPY: Record<SpeakBlockReason, { title: string; body?: string }> = {
  'no-mic': {
    title: 'flashcards.speak.unavailable.noMic',
    body: 'flashcards.speak.unavailable.noMicBody',
  },
  'mic-blocked': {
    title: 'flashcards.speak.unavailable.micBlocked',
    body: 'flashcards.speak.unavailable.micBlockedBody',
  },
  framed: {
    title: 'flashcards.speak.unavailable.framed',
    body: 'flashcards.speak.unavailable.framedBody',
  },
  'download-failed': {
    title: 'flashcards.speak.unavailable.downloadFailed',
    body: 'flashcards.speak.unavailable.downloadFailedBody',
  },
  integrity: {
    title: 'flashcards.speak.unavailable.downloadFailed',
    body: 'flashcards.speak.unavailable.downloadFailedBody',
  },
  'too-slow': { title: 'flashcards.speak.unavailable.tooSlow' },
  'no-wasm': { title: 'flashcards.speak.unavailable.unsupported' },
  'no-worker': { title: 'flashcards.speak.unavailable.unsupported' },
  'no-capture': { title: 'flashcards.speak.unavailable.unsupported' },
};

/** F12: Speak shown disabled with the reason; the other modes keep working. */
const SpeakBlocked: React.FC<{
  dark: boolean;
  reason: SpeakBlockReason;
  onRetry?: () => void;
}> = ({ dark, reason, onRetry }) => {
  const { t } = useTranslation();
  const copy = BLOCK_COPY[reason];
  return (
    <Centered>
      <Panel dark={dark} role="alert">
        <MicOff
          aria-hidden="true"
          className={cx('mx-auto', dark ? 'text-white/70' : 'text-slate-500')}
          style={{ width: 'min(28px, 6cqmin)', height: 'min(28px, 6cqmin)' }}
        />
        <p
          className={cx(
            'font-black uppercase tracking-widest',
            dark ? 'text-white/70' : 'text-slate-600'
          )}
          style={{
            marginTop: 'min(8px, 2cqmin)',
            fontSize: 'min(10px, 2.7cqmin)',
          }}
        >
          {t('flashcards.speak.unavailable.title')}
        </p>
        <PanelTitle>{t(copy.title)}</PanelTitle>
        {copy.body && <PanelBody dark={dark}>{t(copy.body)}</PanelBody>}
        {reason === 'mic-blocked' && isChromeOs() && (
          <PanelBody dark={dark}>
            {t('flashcards.speak.unavailable.micBlockedChromeOs')}
          </PanelBody>
        )}
        <PanelBody dark={dark}>
          {t('flashcards.speak.unavailable.otherModes')}
        </PanelBody>
        {(reason === 'framed' || onRetry) && (
          <ButtonRow>
            {reason === 'framed' && (
              // no-tour-anchor: student player
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className={primaryButton}
                style={buttonStyle}
              >
                <ExternalLink aria-hidden="true" style={iconStyle} />
                {t('flashcards.speak.unavailable.openNewTab')}
              </a>
            )}
            {onRetry && (
              // no-tour-anchor: student player
              <button
                type="button"
                onClick={onRetry}
                className={
                  reason === 'framed' ? secondaryButton(dark) : primaryButton
                }
                style={buttonStyle}
              >
                <RotateCcw aria-hidden="true" style={iconStyle} />
                {t('flashcards.speak.unavailable.retry')}
              </button>
            )}
          </ButtonRow>
        )}
      </Panel>
    </Centered>
  );
};

const SpeakPractice: React.FC<SpeakModeProps> = ({
  cards,
  round,
  language,
  settings,
  framed,
  starred,
  showMarks,
  dark,
  onRecord,
  onStar,
  onNextRound,
  onRestart,
  paused = false,
  onSaveHeard,
}) => {
  const { t } = useTranslation();
  const recognizer = getRecognizer();
  const [heardSave, setHeardSave] = useState<
    'idle' | 'saving' | 'saved' | 'failed'
  >('idle');
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'armed' });
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [unclearStreak, setUnclearStreak] = useState(0);
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  const [passed, setPassed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [summary, setSummary] = useState(false);
  const [permission, setPermission] = useState<MicPermission | null>(null);
  const [asked, setAsked] = useState(false);
  const [retried, setRetried] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [, setVoicesVersion] = useState(0);
  const runRef = useRef(0);
  const takeUrlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopHearRef = useRef<(() => void) | null>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const [frameBlocked] = useState(() => framed && !frameAllowsMic());
  const [captureMissing] = useState(() => !canCapture());
  const [deps] = useState<AudioRecordingDeps>(() => ({
    ...defaultAudioRecordingDeps,
    getStream: async (constraints) => {
      const next = await defaultAudioRecordingDeps.getStream(constraints);
      setStream(next);
      return next;
    },
  }));

  const card = cards[index];
  const refs = card ? cardRefs(card, settings.dialects) : [];
  const word = card ? spokenWord(card) : '';
  const hearDialect =
    phase.kind === 'result' && phase.judgement.dialect
      ? phase.judgement.dialect
      : (refs[0]?.dialect ?? settings.dialects[0]);
  const canHear =
    settings.example && Boolean(hearDialect && hearItVoice(hearDialect));

  useEffect(() => {
    let cancelled = false;
    void micPermission().then((value) => {
      if (!cancelled) setPermission(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribeVoices(() => setVoicesVersion((v) => v + 1)), []);

  useEffect(
    () => () => {
      // A result that lands after unmount must not record a card the student left.
      runRef.current += 1;
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
      audioRef.current?.pause();
      stopHearRef.current?.();
    },
    []
  );

  const replaceTake = (take: AudioTake | null) => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
    const url = take ? URL.createObjectURL(take.blob) : null;
    takeUrlRef.current = url;
    setTakeUrl(url);
  };

  const focusSoon = (ref: React.RefObject<HTMLButtonElement | null>) =>
    window.requestAnimationFrame(() => ref.current?.focus());

  const decide = (judgement: SpeakJudgement, heard: string[] = []) => {
    if (!card) return;
    if (judgement.verdict === 'unclear') {
      const streak = unclearStreak + 1;
      setUnclearStreak(streak);
      setPhase({
        kind: streak >= UNCLEAR_BEFORE_MIC_CHECK ? 'mic-check' : 'unclear',
      });
      focusSoon(actionRef);
      return;
    }
    const used = attemptsUsed + 1;
    const pass =
      judgement.verdict === 'exact' || judgement.verdict === 'accepted';
    const decided = pass || used >= settings.attempts;
    setAttemptsUsed(used);
    setUnclearStreak(0);
    if (decided) {
      onRecord(card.id, pass, judgement.accuracy, used, judgement.tally);
      if (pass) setPassed((count) => count + 1);
      else setFailed((count) => count + 1);
    }
    setHeardSave('idle');
    setPhase({ kind: 'result', judgement, decided, passed: pass, heard });
    focusSoon(actionRef);
  };

  const onTakeReady = (take: AudioTake) => {
    if (!card) return;
    const run = runRef.current;
    replaceTake(take);
    setStream(null);
    setPhase({ kind: 'checking' });
    void recognizer
      .recognize(take.blob)
      .then((result) => {
        if (runRef.current !== run) return;
        let judgement: SpeakJudgement;
        try {
          judgement = judgeTake({
            card,
            result,
            language,
            settings,
            unclearConfidence: settings.unclearConfidence,
          });
        } catch {
          judgement = {
            verdict: 'unclear',
            dialect: null,
            accuracy: 0,
            entries: [],
            stress: 'not-judged',
            forgivenGroups: [],
            tally: {},
          };
        }
        decide(
          judgement,
          result.tokens.map((token) => token.symbol)
        );
      })
      .catch((err: unknown) => {
        if (runRef.current !== run) return;
        // too-slow moves the recognizer to unsupported, which swaps in the F12 panel.
        if (err instanceof RecognizerError && err.code === 'too-slow') return;
        void recognizer.prepare({ allowMetered: false });
        setPhase({ kind: 'unclear' });
        focusSoon(actionRef);
      });
  };

  const capture = useAudioRecording({
    config: SPEAK_RECORDING,
    enabled: true,
    onTakeReady,
    audioBitsPerSecond: SPEAK_BITS_PER_SECOND,
    constraints: SPEAK_CONSTRAINTS,
    deps,
  });

  const blockReason: SpeakBlockReason | null = frameBlocked
    ? 'framed'
    : captureMissing
      ? 'no-capture'
      : capture.phase === 'capture-unavailable'
        ? reasonFromMicState(capture.micState, framed)
        : permission === 'denied' && !retried
          ? 'mic-blocked'
          : null;

  const recording =
    capture.phase === 'recording' || capture.phase === 'requesting-permission';

  // The student just speaks; the take ends itself, and Stop stays for anyone who wants it.
  useSpeechEnd(capture.phase === 'recording' ? stream : null, capture.stop);

  const startTake = () => {
    if (blockReason || recording || phase.kind === 'checking') return;
    stopHearRef.current?.();
    if (permission !== 'granted' && !asked) {
      setPhase({ kind: 'permission' });
      return;
    }
    setPhase({ kind: 'armed' });
    void capture.start();
  };

  const toggleRecording = () => {
    if (capture.phase === 'recording') capture.stop();
    else startTake();
  };

  const allowMic = () => {
    setAsked(true);
    setPhase({ kind: 'armed' });
    void capture.start();
  };

  const retryMic = () => {
    setRetried(true);
    setAsked(true);
    capture.arm();
    setPhase({ kind: 'armed' });
  };

  const playTake = () => {
    if (!takeUrlRef.current) return;
    stopHearRef.current?.();
    audioRef.current?.pause();
    const audio = new Audio(takeUrlRef.current);
    audioRef.current = audio;
    void audio.play().catch(() => undefined);
  };

  const playExample = () => {
    if (!canHear || !hearDialect) return;
    audioRef.current?.pause();
    stopHearRef.current?.();
    stopHearRef.current = hearIt(word, hearDialect).stop;
  };

  const next = () => {
    runRef.current += 1;
    replaceTake(null);
    stopHearRef.current?.();
    setAttemptsUsed(0);
    setUnclearStreak(0);
    setPhase({ kind: 'armed' });
    if (index >= cards.length - 1) setSummary(true);
    else {
      setIndex((current) => current + 1);
      focusSoon(micButtonRef);
    }
  };

  const decidedResult = phase.kind === 'result' && phase.decided;

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (paused || summary || blockReason || isTypingTarget(event.target))
      return;
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const recordingNow = capture.phase === 'recording';
    const onButton = event.target instanceof HTMLButtonElement;
    const key = event.key.toLowerCase();
    if (event.key === ' ' && !onButton) {
      if (decidedResult || phase.kind === 'mic-check') return;
      event.preventDefault();
      toggleRecording();
    } else if (event.key === 'Enter' && !onButton && decidedResult) {
      event.preventDefault();
      next();
    } else if (key === 'r' && !recordingNow && takeUrlRef.current) {
      event.preventDefault();
      playTake();
    } else if (key === 'h' && !recordingNow && canHear) {
      event.preventDefault();
      playExample();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (summary) {
    return (
      <RoundSummary
        round={round}
        correct={passed}
        wrong={failed}
        dark={dark}
        onNextRound={onNextRound}
        onRestart={onRestart}
      />
    );
  }
  if (!card) return null;
  if (blockReason) {
    return (
      <SpeakBlocked
        dark={dark}
        reason={blockReason}
        onRetry={
          blockReason === 'mic-blocked' ||
          blockReason === 'no-mic' ||
          (blockReason === 'framed' && !frameBlocked)
            ? retryMic
            : undefined
        }
      />
    );
  }

  const isStarred = starred.includes(card.id);
  const judgement = phase.kind === 'result' ? phase.judgement : null;
  const matchedRef = judgement ? judgedRef(refs, judgement) : undefined;
  const marks = judgement ? speakMarks(judgement, language) : [];
  const segments = judgement ? letterSegments(word, matchedRef, marks) : null;
  const syllables =
    judgement &&
    (judgement.stress === 'error' || judgement.stress === 'forgiven')
      ? stressSyllables(word, matchedRef)
      : null;

  const hearButton = canHear && (
    // no-tour-anchor: student player
    <button
      type="button"
      onClick={playExample}
      aria-keyshortcuts="H"
      className={secondaryButton(dark)}
      style={buttonStyle}
    >
      <Volume2 aria-hidden="true" style={iconStyle} />
      {t('flashcards.speak.player.hearIt')}
    </button>
  );
  const playButton = takeUrl && (
    // no-tour-anchor: student player
    <button
      type="button"
      onClick={playTake}
      aria-keyshortcuts="R"
      className={secondaryButton(dark)}
      style={buttonStyle}
    >
      <Play aria-hidden="true" style={iconStyle} />
      {t('flashcards.speak.player.playMyTry')}
    </button>
  );
  const saveHeardButton = (
    cardId: string,
    result: Extract<Phase, { kind: 'result' }>
  ) => {
    const refs = heardReferences(result.heard, language, XLSR53_VOCAB);
    if (!refs || !onSaveHeard) return null;
    return (
      // no-tour-anchor: admin-only, inside the Words to check practice
      <button
        type="button"
        disabled={heardSave === 'saving' || heardSave === 'saved'}
        onClick={() => {
          setHeardSave('saving');
          onSaveHeard(cardId, refs).then(
            () => setHeardSave('saved'),
            () => setHeardSave('failed')
          );
        }}
        className={secondaryButton(dark)}
        style={buttonStyle}
      >
        <Save aria-hidden="true" style={iconStyle} />
        {heardSave === 'saved'
          ? t('flashcards.speak.admin.wordsToCheck.savedHowISaid')
          : heardSave === 'failed'
            ? t('plcDashboard.members.actionError')
            : t('flashcards.speak.admin.wordsToCheck.saveHowISaid')}
      </button>
    );
  };
  const tryAgainButton = (
    // no-tour-anchor: student player
    <button
      ref={actionRef}
      type="button"
      onClick={startTake}
      className={primaryButton}
      style={buttonStyle}
    >
      <Mic aria-hidden="true" style={iconStyle} />
      {t('flashcards.speak.player.tryAgain')}
    </button>
  );
  const continueButton = (
    // no-tour-anchor: student player
    <button
      ref={actionRef}
      type="button"
      onClick={next}
      aria-keyshortcuts="Enter"
      className={primaryButton}
      style={buttonStyle}
    >
      {t('flashcards.speak.player.continue')}
    </button>
  );

  const stressAround = aroundSlot(
    t('flashcards.speak.verdict.stress', { syllables: SLOT })
  );
  const stressLine = syllables && (
    <p
      lang={language}
      className="font-bold"
      style={{
        marginTop: 'min(10px, 2.3cqmin)',
        fontSize: 'min(13px, 3.4cqmin)',
      }}
    >
      {stressAround[0]}
      {syllables.map((piece, i) => (
        <React.Fragment key={i}>
          {i > 0 && '-'}
          {piece.stressed ? (
            <strong className="font-black underline decoration-2 underline-offset-4">
              {piece.text.toLocaleUpperCase(language)}
            </strong>
          ) : (
            piece.text
          )}
        </React.Fragment>
      ))}
      {stressAround[1]}
    </p>
  );

  const resultPanel = () => {
    if (phase.kind !== 'result' || !judgement) return null;
    const accepted = judgement.verdict === 'accepted';
    const exact = judgement.verdict === 'exact';
    return (
      <Panel dark={dark} tone={phase.passed ? 'emerald' : 'rose'} role="status">
        <p
          className="inline-flex items-center font-black"
          style={{ gap: 'min(6px, 1.4cqmin)', fontSize: 'min(16px, 4cqmin)' }}
        >
          {phase.passed ? (
            <Check aria-hidden="true" style={iconStyle} />
          ) : (
            <RotateCcw aria-hidden="true" style={iconStyle} />
          )}
          {t(
            exact
              ? 'flashcards.speak.verdict.exact'
              : accepted
                ? 'flashcards.speak.verdict.accepted'
                : phase.decided
                  ? 'flashcards.speak.verdict.outOfTries'
                  : 'flashcards.speak.verdict.notYet'
          )}
        </p>
        {(exact || accepted || !phase.decided) && (
          <PanelBody dark={dark}>
            {t(
              exact
                ? 'flashcards.speak.verdict.exactBody'
                : accepted
                  ? 'flashcards.speak.verdict.acceptedBody'
                  : 'flashcards.speak.verdict.notYetBody'
            )}
          </PanelBody>
        )}
        {accepted && judgement.forgivenGroups.length > 0 && (
          <ul
            className="font-bold"
            style={{
              marginTop: 'min(4px, 1cqmin)',
              fontSize: 'min(13px, 3.4cqmin)',
            }}
          >
            {judgement.forgivenGroups.map((id) => (
              <li key={id}>{t(`flashcards.speak.groups.${id}`)}</li>
            ))}
          </ul>
        )}
        {marks.length > 0 && (
          <div style={{ marginTop: 'min(12px, 3cqmin)' }}>
            <SpeakMarks
              segments={segments}
              marks={marks}
              language={language}
              dark={dark}
            />
          </div>
        )}
        {stressLine}
        <ButtonRow>
          {phase.decided ? continueButton : tryAgainButton}
          {playButton}
          {hearButton}
          {onSaveHeard && card && saveHeardButton(card.id, phase)}
        </ButtonRow>
      </Panel>
    );
  };

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-transparent"
      style={{ paddingBottom: 'min(8px, 2cqmin)' }}
    >
      <div
        className="m-auto flex w-full max-w-3xl flex-col items-center"
        style={{ gap: 'min(14px, 3cqmin)' }}
      >
        <section
          className={cx(
            'relative w-full shrink-0 rounded-[min(26px,5.5cqmin)] border text-center shadow-xl',
            dark
              ? 'border-white/15 bg-slate-950/55 text-white'
              : 'border-slate-200 bg-white text-slate-900'
          )}
          style={{ padding: 'min(22px, 5cqmin)' }}
        >
          <div
            className={cx(
              'font-black uppercase tracking-widest',
              dark ? 'text-cyan-200' : 'text-rose-700'
            )}
            style={{ fontSize: 'min(11px, 2.8cqmin)' }}
          >
            {t('flashcards.speak.player.prompt')} · {index + 1}/{cards.length}
          </div>
          <h2
            lang={language}
            className="mx-auto max-w-[26ch] font-black leading-tight [overflow-wrap:anywhere] [text-wrap:balance]"
            style={{
              marginTop: 'min(10px, 2.5cqmin)',
              fontSize: 'clamp(20px, 8cqmin, 46px)',
            }}
          >
            {card.term}
          </h2>
          <div
            role="img"
            aria-label={t('flashcards.speak.player.attempt', {
              current: Math.min(attemptsUsed + 1, settings.attempts),
              total: settings.attempts,
            })}
            className="flex flex-wrap justify-center"
            style={{
              gap: 'min(5px, 1.2cqmin)',
              marginTop: 'min(12px, 3cqmin)',
            }}
          >
            {Array.from({ length: settings.attempts }, (_, i) => (
              <span
                key={i}
                className={cx(
                  'rounded-full border-2',
                  i < attemptsUsed
                    ? 'border-rose-600 bg-rose-600'
                    : dark
                      ? 'border-white/40'
                      : 'border-slate-300'
                )}
                style={{
                  width: 'min(10px, 2.3cqmin)',
                  height: 'min(10px, 2.3cqmin)',
                }}
              />
            ))}
          </div>
          {showMarks && (
            // no-tour-anchor: student player
            <button
              type="button"
              onClick={() => onStar(card.id)}
              aria-label={t(
                isStarred
                  ? 'flashcards.cards.favoriteRemove'
                  : 'flashcards.cards.favoriteAdd'
              )}
              aria-pressed={isStarred}
              className={cx(
                'absolute rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300',
                isStarred
                  ? 'bg-amber-400 text-amber-950'
                  : dark
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : 'bg-slate-100 text-amber-900 hover:bg-amber-100'
              )}
              style={{
                right: 'min(16px, 3.5cqmin)',
                top: 'min(16px, 3.5cqmin)',
                padding: 'min(8px, 2cqmin)',
              }}
            >
              <Star
                aria-hidden="true"
                fill={isStarred ? 'currentColor' : 'none'}
                style={{
                  width: 'min(18px, 4cqmin)',
                  height: 'min(18px, 4cqmin)',
                }}
              />
            </button>
          )}
        </section>

        {phase.kind === 'result' ? (
          resultPanel()
        ) : phase.kind === 'permission' ? (
          <Panel dark={dark}>
            <PanelTitle>{t('flashcards.speak.permission.title')}</PanelTitle>
            <PanelBody dark={dark}>
              {t('flashcards.speak.permission.body')}
            </PanelBody>
            <ButtonRow>
              {/* no-tour-anchor: student player */}
              <button
                type="button"
                onClick={allowMic}
                className={primaryButton}
                style={buttonStyle}
                autoFocus
              >
                <Mic aria-hidden="true" style={iconStyle} />
                {t('flashcards.speak.permission.allow')}
              </button>
              {/* no-tour-anchor: student player */}
              <button
                type="button"
                onClick={() => setPhase({ kind: 'armed' })}
                className={secondaryButton(dark)}
                style={buttonStyle}
              >
                {t('flashcards.speak.permission.notNow')}
              </button>
            </ButtonRow>
          </Panel>
        ) : phase.kind === 'checking' ? (
          <p
            role="status"
            className={cx(
              'inline-flex items-center font-bold',
              dark ? 'text-white/85' : 'text-slate-700'
            )}
            style={{ gap: 'min(8px, 2cqmin)', fontSize: 'min(14px, 3.6cqmin)' }}
          >
            <Loader2
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
              style={iconStyle}
            />
            {t('flashcards.speak.player.checking')}
          </p>
        ) : phase.kind === 'unclear' ? (
          <Panel dark={dark} role="status">
            <PanelTitle>{t('flashcards.speak.verdict.unclear')}</PanelTitle>
            <PanelBody dark={dark}>
              {t('flashcards.speak.verdict.unclearBody')}
            </PanelBody>
            <ButtonRow>
              {tryAgainButton}
              {playButton}
              {/* no-tour-anchor: student player */}
              <button
                type="button"
                onClick={next}
                className={secondaryButton(dark)}
                style={buttonStyle}
              >
                {t('flashcards.speak.player.skip')}
              </button>
            </ButtonRow>
          </Panel>
        ) : phase.kind === 'mic-check' ? (
          <MicCheck
            dark={dark}
            word={MIC_CHECK_WORD[language]}
            language={language}
            actionRef={actionRef}
            onDone={() => {
              setUnclearStreak(0);
              setPhase({ kind: 'armed' });
              focusSoon(micButtonRef);
            }}
          />
        ) : (
          <div
            className="flex w-full flex-col items-center"
            style={{ gap: 'min(10px, 2.3cqmin)' }}
          >
            {/* no-tour-anchor: student player */}
            <button
              ref={micButtonRef}
              type="button"
              onClick={toggleRecording}
              aria-keyshortcuts="Space"
              title={t('flashcards.speak.player.keys')}
              disabled={capture.phase === 'requesting-permission'}
              className={cx(
                'inline-flex items-center rounded-full font-black text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 disabled:opacity-60',
                capture.phase === 'recording'
                  ? 'bg-slate-900 hover:bg-slate-800'
                  : 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700'
              )}
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(14px, 3.4cqmin) min(24px, 5.5cqmin)',
                fontSize: 'min(14px, 3.6cqmin)',
              }}
              autoFocus
            >
              {capture.phase === 'recording' ? (
                <Square
                  aria-hidden="true"
                  fill="currentColor"
                  style={iconStyle}
                />
              ) : (
                <Mic aria-hidden="true" style={iconStyle} />
              )}
              {t(
                capture.phase === 'recording'
                  ? 'flashcards.speak.player.stop'
                  : 'flashcards.speak.player.record'
              )}
            </button>
            {capture.phase === 'recording' && (
              <>
                <p
                  role="status"
                  className={cx(
                    'font-bold',
                    dark ? 'text-white/85' : 'text-slate-700'
                  )}
                  style={{ fontSize: 'min(12px, 3.2cqmin)' }}
                >
                  {t('flashcards.speak.player.listening')}
                </p>
                <LiveLevelMeter
                  stream={stream}
                  label={t('flashcards.speak.player.levelLabel')}
                  dark={dark}
                />
              </>
            )}
            {(hearButton || playButton) && capture.phase !== 'recording' && (
              <div
                className="flex flex-wrap items-center justify-center"
                style={{ gap: 'min(9px, 2cqmin)' }}
              >
                {hearButton}
                {playButton}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/** §4.4: after three unclear takes in a row, a level meter shows whether the mic hears anything. */
const MicCheck: React.FC<{
  dark: boolean;
  word: string;
  language: SpeakLanguage;
  actionRef: React.RefObject<HTMLButtonElement | null>;
  onDone: () => void;
}> = ({ dark, word, language, actionRef, onDone }) => {
  const { t } = useTranslation();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [heard, setHeard] = useState(false);
  const level = useMicLevel(stream);
  if (!heard && level >= HEARD_LEVEL) setHeard(true);
  const bodyAround = aroundSlot(
    t('flashcards.speak.micCheck.body', { word: SLOT })
  );

  useEffect(() => {
    let active = true;
    let opened: MediaStream | null = null;
    void navigator.mediaDevices
      ?.getUserMedia({ audio: SPEAK_CONSTRAINTS })
      .then((next) => {
        if (!active) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        opened = next;
        setStream(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      opened?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <Panel dark={dark} role="status">
      <PanelTitle>{t('flashcards.speak.micCheck.title')}</PanelTitle>
      <PanelBody dark={dark}>
        {bodyAround[0]}
        <strong lang={language} className="font-black">
          {word}
        </strong>
        {bodyAround[1]}
      </PanelBody>
      <div
        className="flex justify-center"
        style={{ marginTop: 'min(12px, 3cqmin)' }}
      >
        <LevelMeter
          level={level}
          label={t('flashcards.speak.player.levelLabel')}
          dark={dark}
        />
      </div>
      <p
        className="inline-flex items-center font-bold"
        style={{
          gap: 'min(6px, 1.4cqmin)',
          marginTop: 'min(8px, 2cqmin)',
          fontSize: 'min(12px, 3.2cqmin)',
        }}
      >
        {heard ? (
          <Check aria-hidden="true" style={iconStyle} />
        ) : (
          <MicOff aria-hidden="true" style={iconStyle} />
        )}
        {t(
          heard
            ? 'flashcards.speak.micCheck.heard'
            : 'flashcards.speak.micCheck.notHeard'
        )}
      </p>
      <ButtonRow>
        {/* no-tour-anchor: student player */}
        <button
          ref={actionRef}
          type="button"
          onClick={onDone}
          className={primaryButton}
          style={buttonStyle}
        >
          {t('flashcards.speak.micCheck.done')}
        </button>
      </ButtonRow>
    </Panel>
  );
};
