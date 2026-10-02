import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  BarChart3,
  Copy,
  Eye,
  EyeOff,
  Hash,
  Loader2,
  MonitorPlay,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Projector,
  Settings,
  Square,
  Trophy,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import {
  QuizSession,
  QuizResponse,
  QuizData,
  QuizConfig,
  ClassRoster,
  StudentOverride,
} from '@/types';
import { db } from '@/config/firebase';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { AuthContext } from '@/context/AuthContextValue';
import { useClickOutside } from '@/hooks/useClickOutside';
import { logError } from '@/utils/logError';
import {
  playPodiumFanfare,
  playQuizCompleteCelebration,
} from '@/utils/quizAudio';
import type {
  FibGradingContext,
  LocalizedFibAnswers,
} from '@/utils/quizFibAnswers';
import {
  buildLiveLeaderboard,
  buildGameLeaderboard,
  getDisplayScore,
  isGamificationActive,
} from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import { Z_INDEX } from '@/config/zIndex';
import { resolveStimuli } from '@/utils/quizStimuli';
import { PresentSession } from '@/components/widgets/QuizWidget/components/present/PresentSession';
import { boardRankRows, rankOrdinal } from '@/utils/reviewLaunch';
import { useMonitorData } from './useMonitorData';
import { CurrentQuestionCard } from './CurrentQuestionCard';
import { useGameClockControls } from './useGameClockControls';
import { GameBoard } from '@/components/widgets/QuizWidget/components/game/GameBoard';
import { useServerNow } from '@/hooks/useServerNow';
import { readGameClock, summarizeGameBoard } from '@/utils/quizGame';
import { StatusBuckets, BucketKey } from './StatusBuckets';
import { RosterList } from './RosterList';
import { PeriodAccessStrip } from './PeriodAccessStrip';
import { PeriodBar } from './PeriodBar';
import { EXTEND_MS, usePeriodAccess } from '@/hooks/usePeriodAccess';
import { hasPeriodAccess } from '@/utils/periodAccess';
import { QuestionResults, QuestionDetail } from './QuestionResults';
import { JoinCodeScreen } from './JoinCodeScreen';
import { QuizSettingsScreen } from './QuizSettingsScreen';
import { tourAttr } from '@/config/tourAnchors';
import { useViewAsOutward, VIEW_AS_WRITES } from '@/hooks/useViewAsOutward';

export interface QuizLiveMonitorProps {
  /** This widget instance's id, for live-tour anchor scoping. */
  widgetId?: string;
  session: QuizSession;
  responses: QuizResponse[];
  quizData: QuizData;
  onAdvance: () => Promise<void>;
  /** Make the assignment inactive (kills the student URL, keeps responses). */
  onEnd: () => Promise<void>;
  onPause?: () => Promise<void>;
  onResume?: () => Promise<void>;
  config: QuizConfig;
  rosters: ClassRoster[];
  onUpdateConfig: (updates: Partial<QuizConfig>) => void;
  /** Remove a student by response-doc key (`response._responseKey`). */
  onRemoveStudent?: (responseKey: string) => Promise<void>;
  /** Unlock a locked/auto-submitted attempt by response-doc key. */
  onUnlockStudent?: (responseKey: string) => Promise<void>;
  /** Unlock a results-view lockout by response-doc key. */
  onUnlockResultsForStudent?: (responseKey: string) => Promise<void>;
  /** Clear a student's raised hand by response-doc key. */
  onClearHand?: (responseKey: string) => Promise<void>;
  onRevealAnswer?: (questionId: string, correctAnswer: string) => Promise<void>;
  onHideAnswer?: (questionId: string) => Promise<void>;
  /** Navigate back to the manager view without ending the quiz. */
  onBack?: () => void;
  /** Hide the scoreboard-sync setting (contexts with no board behind). */
  hideLiveScoreboard?: boolean;
  /** Quiz-kind session with the Review split on: no reveal, podium, sounds or scoreboard sync (D9). */
  assessmentOnly?: boolean;
  /** M17 E2 F2: the active assignment's per-student accommodation overrides
   *  (teacher's own assignment doc), keyed by `StudentTargetRef` key — used
   *  by `RosterList` to resolve each row's effective tab-warning threshold. */
  overridesBySourcedId?: Record<string, StudentOverride> | null;
  /** Translated FIB answer keys snapshotted on the assignment doc (PR4). */
  localizedFibAnswers?: LocalizedFibAnswers | null;
  /** Per-student overrides keyed by pseudonym uid; names each student's served locale. */
  overridesByStudentUid?: Record<string, StudentOverride> | null;
  /** Write-once served language per uid; grades a de-targeted student's old work. */
  servedLanguageByStudentUid?: Record<string, string> | null;
}

type Screen =
  | { name: 'home' }
  | { name: 'questions' }
  | { name: 'question'; index: number }
  | { name: 'code' }
  | { name: 'settings' };

const SCREEN_TITLES: Record<
  Exclude<Screen['name'], 'home' | 'question'>,
  string
> = {
  questions: 'Question results',
  code: 'Join code',
  settings: 'Quiz settings',
};

export const MonitorShell: React.FC<QuizLiveMonitorProps> = (props) => {
  const {
    widgetId,
    session,
    responses,
    quizData,
    onAdvance,
    onEnd,
    onPause,
    onResume,
    config,
    rosters,
    onUpdateConfig,
    onRemoveStudent,
    onUnlockStudent,
    onUnlockResultsForStudent,
    onClearHand,
    onRevealAnswer,
    onHideAnswer,
    onBack,
    hideLiveScoreboard = false,
    assessmentOnly = false,
    overridesBySourcedId = null,
    localizedFibAnswers = null,
    overridesByStudentUid = null,
    servedLanguageByStudentUid = null,
  } = props;
  const fibGrading = useMemo<FibGradingContext>(
    () => ({
      answers: localizedFibAnswers,
      overridesByStudentUid,
      overridesBySourcedId,
      servedLanguageByStudentUid,
    }),
    [
      localizedFibAnswers,
      overridesByStudentUid,
      overridesBySourcedId,
      servedLanguageByStudentUid,
    ]
  );

  const { showConfirm } = useDialog();
  const outward = useViewAsOutward();
  const { addToast } = useDashboard();
  // Read via context so a provider-less (sub portal) mount keeps today's behavior.
  const authContext = useContext(AuthContext);
  const showJoinCode =
    !!session.code &&
    authContext?.canAccessFeature?.('anonymous-join') !== false;
  const data = useMonitorData(
    session,
    responses,
    quizData,
    config,
    rosters,
    fibGrading
  );

  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [gameNames, setGameNames] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  // Per-period sessions swap the single Pause button for one chip per period.
  const perPeriod = hasPeriodAccess(session);
  const periodNameFor = (key: string): string =>
    session.classPeriodByClassId?.[key] ??
    session.periodAccess?.[key]?.label ??
    key;
  const showStrip = perPeriod && session.status !== 'ended';
  // Chips double as the class filter only when every filter name has a chip.
  const chipNames = new Set(
    Object.keys(session.periodAccess ?? {}).map(periodNameFor)
  );
  const chipsFilter =
    showStrip && data.periodNames.every((p) => chipNames.has(p));
  const periodActions = usePeriodAccess(
    perPeriod ? session : null,
    {
      sessionCollection: 'quiz_sessions',
      assignmentCollection: 'quiz_assignments',
    },
    rosters
  );
  const periodFailed = (err: unknown) => {
    logError('QuizLiveMonitor.periodAccess', err);
    addToast('Could not update the period. Try again.', 'error');
  };
  const startPeriods = async (start: () => Promise<string[]>) => {
    try {
      const untimed = await start();
      const labels = untimed
        .map((key) => session.periodAccess?.[key]?.label)
        .filter(Boolean);
      if (labels.length > 0)
        addToast(
          `${labels.join(', ')} stays open until you pause it. Tag the class with its bell period in My Classes so it closes at the bell.`,
          'info'
        );
    } catch (err) {
      periodFailed(err);
    }
  };
  const runPeriod = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      periodFailed(err);
    }
  };
  // The class picker shows one class or all, so drop a multi-class filter.
  if (chipsFilter && data.selectedPeriods.length > 1)
    data.setSelectedPeriods([]);
  const periodBar = chipsFilter &&
    session.periodAccess && {
      periodAccess: session.periodAccess,
      selected:
        data.selectedPeriods.length === 1
          ? (Object.keys(session.periodAccess).find(
              (key) => periodNameFor(key) === data.selectedPeriods[0]
            ) ?? '')
          : '',
      onSelect: (key: string) =>
        data.setSelectedPeriods(key ? [periodNameFor(key)] : []),
      onStart: (keys: string[]) =>
        startPeriods(() =>
          keys.length === 1
            ? periodActions.startPeriod(keys[0])
            : periodActions.startAll()
        ),
      onPause: (keys: string[]) =>
        runPeriod(() =>
          keys.length === 1
            ? periodActions.pausePeriod(keys[0])
            : periodActions.pauseAll()
        ),
      onExtend: (key: string, by: number | null) =>
        runPeriod(() => periodActions.extendPeriod(key, by)),
      extendMs: EXTEND_MS,
    };

  // Reset local navigation when the monitored session changes.
  const [prevSessionId, setPrevSessionId] = useState(session.id);
  if (session.id !== prevSessionId) {
    setPrevSessionId(session.id);
    setScreen({ name: 'home' });
    setOpenBucket(null);
    setPresenting(false);
    setGameNames(false);
  }

  const isGame = session.sessionMode === 'game';
  const tourType = session.widgetKind ?? 'quiz';
  const gameNow = useServerNow(
    isGame && session.status !== 'ended' ? 250 : null
  );
  const gameControls = useGameClockControls(session, isGame, (message) =>
    addToast(message, 'error')
  );
  const gameClock = readGameClock(session, gameNow);
  const gameStats = isGame ? summarizeGameBoard(responses, gameNow) : null;
  const gameEntries = useMemo(
    () =>
      isGame
        ? buildGameLeaderboard(responses, data.pinToName, data.byStudentUid)
        : [],
    [isGame, responses, data.pinToName, data.byStudentUid]
  );
  const gameBoard = gameStats && {
    clock: gameClock,
    stats: gameStats,
    entries: gameEntries,
    rows: boardRankRows(session.boardRankLimit),
    showNames: gameNames,
    nowMs: gameNow,
  };
  const scoringConfig = {
    speedBonusEnabled: session.speedBonusEnabled,
    streakBonusEnabled: session.streakBonusEnabled,
  };

  // Review ranks everyone so each device finds its own row; names stay top 10 only.
  const liveEntries = () =>
    (isGame
      ? buildGameLeaderboard(responses, data.pinToName, data.byStudentUid)
      : buildLiveLeaderboard(
          responses,
          quizData.questions,
          scoringConfig,
          data.pinToName,
          data.byStudentUid,
          fibGrading,
          session.boardRankLimit ? null : 10
        )
    ).map((entry) => {
      if (entry.rank <= 10) return entry;
      const { name: _hidden, ...rest } = entry;
      return rest;
    });

  // Broadcast the live leaderboard to the session doc (unchanged plumbing).
  const fingerprintRef = useRef<string | null>(null);
  const clearedRef = useRef(false);
  useEffect(() => {
    fingerprintRef.current = null;
    clearedRef.current = false;
  }, [session.id]);
  useEffect(() => {
    const sessionRef = doc(db, 'quiz_sessions', session.id);
    const shouldBroadcast =
      session.status === 'active' &&
      (isGame || isGamificationActive(scoringConfig));
    if (!shouldBroadcast) {
      if (session.status === 'ended' || clearedRef.current) return;
      clearedRef.current = true;
      fingerprintRef.current = null;
      updateDoc(sessionRef, { liveLeaderboard: deleteField() }).catch((err) =>
        console.error(
          '[QuizLiveMonitor] Failed clearing live leaderboard:',
          err
        )
      );
      return;
    }
    clearedRef.current = false;
    const timer = setTimeout(() => {
      const entries = liveEntries();
      const fingerprint = JSON.stringify(entries);
      if (fingerprint === fingerprintRef.current) return;
      fingerprintRef.current = fingerprint;
      updateDoc(sessionRef, { liveLeaderboard: entries }).catch((err) =>
        console.error(
          '[QuizLiveMonitor] Failed updating live leaderboard:',
          err
        )
      );
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    responses,
    quizData.questions,
    data.pinToName,
    data.byStudentUid,
    session.id,
    session.status,
    session.speedBonusEnabled,
    session.streakBonusEnabled,
    session.boardRankLimit,
  ]);

  // Sound cues on review phase and session end.
  const soundsOn = (session.soundEffectsEnabled ?? false) && !assessmentOnly;
  const isReviewing = session.questionPhase === 'reviewing';
  const prevReviewingRef = useRef(isReviewing);
  useEffect(() => {
    if (!prevReviewingRef.current && isReviewing) {
      if (soundsOn && !soundMuted) playPodiumFanfare();
    }
    prevReviewingRef.current = isReviewing;
  }, [isReviewing, soundsOn, soundMuted]);
  const prevStatusRef = useRef(session.status);
  useEffect(() => {
    if (prevStatusRef.current === 'active' && session.status === 'ended') {
      if (soundsOn && !soundMuted) playQuizCompleteCelebration();
    }
    prevStatusRef.current = session.status;
  }, [session.status, soundsOn, soundMuted]);

  const handleEnd = async () => {
    if (outward.locked) return;
    const ok = await showConfirm(
      'End this assignment? The student link stops working, but all responses are preserved in the archive.',
      {
        title: 'End Assignment',
        variant: 'warning',
        confirmLabel: 'End',
      }
    );
    if (!ok) return;
    outward.audit('End assignment', VIEW_AS_WRITES.end);
    setEnding(true);
    try {
      // The game's final ranks land before devices switch to their end screen.
      if (isGame)
        await updateDoc(doc(db, 'quiz_sessions', session.id), {
          liveLeaderboard: liveEntries(),
        });
      await onEnd();
    } catch (err) {
      logError('QuizLiveMonitor.end', err);
      addToast('Could not end the assignment. Try again.', 'error');
    } finally {
      setEnding(false);
    }
  };

  const handleTogglePause = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      if (session.status === 'paused') await onResume?.();
      else await onPause?.();
    } catch (err) {
      logError('QuizLiveMonitor.pause', err);
      addToast('Could not update the session. Try again.', 'error');
    } finally {
      setToggling(false);
    }
  };

  const handleRemove = useCallback(
    async (key: string) => {
      try {
        await onRemoveStudent?.(key);
      } catch (err) {
        logError('QuizLiveMonitor.remove', err);
        addToast('Could not remove the student. Try again.', 'error');
      }
    },
    [onRemoveStudent, addToast]
  );

  const handleUnlockAttempt = useCallback(
    async (key: string) => {
      const ok = await showConfirm(
        "Unlock this student's attempt so they can resume? Their answers are preserved.",
        { title: 'Unlock attempt?', variant: 'warning', confirmLabel: 'Unlock' }
      );
      if (!ok) return;
      try {
        await onUnlockStudent?.(key);
        addToast('Attempt unlocked.', 'success');
      } catch (err) {
        logError('QuizLiveMonitor.unlock', err);
        addToast('Could not unlock the attempt. Try again.', 'error');
      }
    },
    [onUnlockStudent, showConfirm, addToast]
  );

  const handleUnlockResults = useCallback(
    async (key: string) => {
      try {
        await onUnlockResultsForStudent?.(key);
        addToast('Results unlocked.', 'success');
      } catch (err) {
        logError('QuizLiveMonitor.unlockResults', err);
        addToast('Could not unlock results. Try again.', 'error');
      }
    },
    [onUnlockResultsForStudent, addToast]
  );

  const handleClearHand = useCallback(
    async (key: string) => {
      try {
        await onClearHand?.(key);
      } catch (err) {
        logError('QuizLiveMonitor.clearHand', err);
        addToast('Could not clear the hand. Try again.', 'error');
      }
    },
    [onClearHand, addToast]
  );

  const handleUpdateSession = useCallback(
    (updates: Partial<QuizSession>) => {
      updateDoc(doc(db, 'quiz_sessions', session.id), updates).catch((err) => {
        logError('QuizLiveMonitor.updateSession', err);
        addToast('Could not save the setting. Try again.', 'error');
      });
    },
    [session.id, addToast]
  );

  const copyJoinLink = () => {
    if (!showJoinCode) return;
    void navigator.clipboard.writeText(
      `${window.location.origin}/quiz?code=${session.code}`
    );
    addToast('Join link copied.', 'success');
  };

  const currentQ = data.currentQ;
  const revealed = currentQ
    ? session.revealedAnswers?.[currentQ.id]
    : undefined;

  // Presentation inputs. Standings reuse the broadcast leaderboard builder so
  // there is only ever one ranking path.
  const standings = useMemo(
    () =>
      presenting && isGame
        ? gameEntries
        : presenting
          ? buildLiveLeaderboard(
              responses,
              quizData.questions,
              {
                speedBonusEnabled: session.speedBonusEnabled,
                streakBonusEnabled: session.streakBonusEnabled,
              },
              data.pinToName,
              data.byStudentUid,
              fibGrading,
              session.boardRankLimit ? null : 10
            )
          : [],
    [
      fibGrading,
      presenting,
      isGame,
      gameEntries,
      session.boardRankLimit,
      responses,
      quizData.questions,
      session.speedBonusEnabled,
      session.streakBonusEnabled,
      data.pinToName,
      data.byStudentUid,
    ]
  );
  const classAverage = useMemo(() => {
    const scored = data.students
      .map((s) => s.bandScore)
      .filter((s): s is number => s != null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
  }, [data.students]);
  const presentHasMedia = resolveStimuli(
    currentQ?.stimulusIds,
    session.stimuli
  ).some((s) => s.type === 'audio' || s.type === 'video');
  const canReveal =
    !assessmentOnly &&
    (session.showCorrectOnBoard ?? false) &&
    session.sessionMode !== 'student' &&
    !!currentQ;

  const menuItems: {
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    divider?: boolean;
  }[] = [
    {
      label: presenting ? 'Close presentation' : 'Present to class',
      icon: MonitorPlay,
      onClick: () => setPresenting((v) => !v),
    },
    {
      label: 'Question results',
      icon: BarChart3,
      onClick: () => setScreen({ name: 'questions' }),
    },
    ...(showJoinCode
      ? [
          {
            label: 'Show join code',
            icon: Hash,
            onClick: () => setScreen({ name: 'code' }),
            divider: true,
          },
          { label: 'Copy join link', icon: Copy, onClick: copyJoinLink },
        ]
      : []),
    ...(canReveal
      ? [
          revealed
            ? {
                label: 'Hide revealed answer',
                icon: EyeOff,
                onClick: () => void onHideAnswer?.(currentQ.id),
                divider: true,
              }
            : {
                label: 'Reveal answer to class',
                icon: Eye,
                onClick: () =>
                  void onRevealAnswer?.(currentQ.id, currentQ.correctAnswer),
                divider: true,
              },
        ]
      : []),
    ...(soundsOn
      ? [
          {
            label: soundMuted ? 'Unmute sounds' : 'Mute sounds',
            icon: soundMuted ? VolumeX : Volume2,
            onClick: () => setSoundMuted((v) => !v),
            divider: !canReveal && !showJoinCode,
          },
        ]
      : []),
    ...(perPeriod && session.status !== 'ended'
      ? [
          {
            label: 'Start all periods',
            icon: Play,
            onClick: () => void startPeriods(periodActions.startAll),
            divider: true,
          },
          {
            label: 'Pause all periods',
            icon: Pause,
            onClick: () => void runPeriod(periodActions.pauseAll),
          },
        ]
      : []),
    {
      label: 'Quiz settings',
      icon: Settings,
      onClick: () => setScreen({ name: 'settings' }),
      divider: true,
    },
  ];

  const statusPill =
    session.status === 'paused'
      ? { label: 'Paused', cls: 'bg-white/20 text-white' }
      : session.status === 'ended'
        ? { label: 'Ended', cls: 'bg-white/20 text-white' }
        : { label: 'Live', cls: 'bg-white text-brand-blue-primary' };

  // Board view hides WHO raised a hand / is idle; on by default since the widget is usually projected.
  const boardView = config.monitorBoardView ?? true;

  const onHome = screen.name === 'home';
  const headerTitle = onHome
    ? session.quizTitle || quizData.title
    : screen.name === 'question'
      ? `Q${screen.index + 1} results`
      : SCREEN_TITLES[screen.name];

  return (
    <div className="h-full w-full flex flex-col bg-white text-brand-gray-dark relative">
      <div
        className="flex items-center bg-brand-blue-primary text-white shrink-0"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
        }}
      >
        {(onBack != null || !onHome) && (
          <button
            onClick={() =>
              onHome
                ? onBack?.()
                : setScreen(
                    screen.name === 'question'
                      ? { name: 'questions' }
                      : { name: 'home' }
                  )
            }
            aria-label="Back"
            className="rounded-md hover:bg-white/15 transition-colors"
            style={{ padding: 'min(4px, 1cqmin)' }}
          >
            <ArrowLeft
              style={{
                width: 'min(16px, 5cqmin)',
                height: 'min(16px, 5cqmin)',
              }}
            />
          </button>
        )}
        <p
          className="font-sans font-semibold truncate flex-1"
          style={{ fontSize: 'min(14px, 5cqmin)' }}
        >
          {headerTitle}
        </p>
        <button
          onClick={() => onUpdateConfig({ monitorBoardView: !boardView })}
          aria-pressed={boardView}
          aria-label={
            boardView
              ? 'Board view on. Hiding who raised a hand or is idle.'
              : 'Teacher view. Showing who raised a hand or is idle.'
          }
          title={
            boardView ? 'Board view: counts only' : 'Teacher view: names shown'
          }
          className={`shrink-0 rounded-md transition-colors ${
            boardView
              ? 'bg-white text-brand-blue-primary'
              : 'text-white/80 hover:bg-white/15'
          }`}
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <Projector
            aria-hidden
            style={{
              width: 'min(16px, 5cqmin)',
              height: 'min(16px, 5cqmin)',
            }}
          />
        </button>
        <span
          className={`shrink-0 rounded-full font-sans font-semibold uppercase tracking-wider ${statusPill.cls}`}
          style={{
            fontSize: 'min(10px, 3.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
          }}
        >
          {statusPill.label}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: 'min(12px, 3cqmin)' }}
      >
        {screen.name === 'home' && (
          <div
            className={`flex flex-col ${isGame && boardView ? 'min-h-full' : ''}`}
            style={{ gap: 'min(10px, 2.5cqmin)' }}
          >
            {showStrip && !periodBar && (
              <PeriodAccessStrip
                periodAccess={session.periodAccess}
                extendMs={EXTEND_MS}
                onStart={(key) =>
                  startPeriods(() => periodActions.startPeriod(key))
                }
                onPause={(key) =>
                  runPeriod(() => periodActions.pausePeriod(key))
                }
                onExtend={(key, by) =>
                  runPeriod(() => periodActions.extendPeriod(key, by))
                }
              />
            )}
            {data.periodNames.length > 1 && !chipsFilter && (
              <div
                className="flex flex-wrap"
                style={{ gap: 'min(4px, 1cqmin)' }}
              >
                {data.periodNames.map((p) => {
                  const on = data.selectedPeriods.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() =>
                        data.setSelectedPeriods(
                          on
                            ? data.selectedPeriods.filter((x) => x !== p)
                            : [...data.selectedPeriods, p]
                        )
                      }
                      aria-pressed={on}
                      className={`rounded-full border font-sans transition-colors ${
                        on
                          ? 'bg-brand-blue-lighter border-brand-blue-primary text-brand-blue-dark'
                          : 'bg-white border-brand-gray-lighter text-brand-gray-primary'
                      }`}
                      style={{
                        fontSize: 'min(10px, 3.5cqmin)',
                        padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            )}
            {gameBoard ? (
              <div
                className={`rounded-xl overflow-hidden border border-brand-gray-lightest ${
                  boardView ? 'relative flex-1' : 'relative shrink-0'
                }`}
                style={{ height: boardView ? undefined : '55cqh' }}
              >
                <div
                  className="absolute inset-0"
                  {...tourAttr('review-game.board', widgetId, tourType)}
                >
                  <GameBoard {...gameBoard} />
                </div>
              </div>
            ) : (
              <CurrentQuestionCard
                session={session}
                currentQ={currentQ}
                answered={data.answeredCurrent}
                total={data.totalStudents}
                doneCount={data.counts.done}
                onAdvance={onAdvance}
                widgetId={widgetId}
                periodControls={periodBar && <PeriodBar {...periodBar} />}
              />
            )}
            {!(isGame && boardView) && (
              <StatusBuckets
                counts={data.counts}
                handCount={
                  session.handRaiseEnabled === true ? data.handCount : 0
                }
                idleCount={data.idleCount}
                openBucket={openBucket}
                onToggle={(key) =>
                  setOpenBucket((cur) => (cur === key ? null : key))
                }
              />
            )}
            {openBucket && !(isGame && boardView) && (
              <RosterList
                bucket={openBucket}
                students={data.byBucket[openBucket]}
                session={session}
                config={config}
                isGamified={data.isGamified}
                onUpdateConfig={onUpdateConfig}
                onRemove={onRemoveStudent ? handleRemove : undefined}
                onUnlockAttempt={
                  onUnlockStudent ? handleUnlockAttempt : undefined
                }
                onUnlockResults={
                  onUnlockResultsForStudent ? handleUnlockResults : undefined
                }
                onClearHand={onClearHand ? handleClearHand : undefined}
                onLetIn={
                  perPeriod && session.status !== 'ended'
                    ? (uid) => void runPeriod(() => periodActions.letIn(uid))
                    : undefined
                }
                overridesBySourcedId={overridesBySourcedId}
                targetRefKeyByStudentUid={data.targetRefKeyByStudentUid}
              />
            )}
          </div>
        )}
        {screen.name === 'questions' && (
          <QuestionResults
            quizData={quizData}
            responses={responses}
            onOpenQuestion={(index) => setScreen({ name: 'question', index })}
          />
        )}
        {screen.name === 'question' && quizData.questions[screen.index] && (
          <QuestionDetail
            session={session}
            question={quizData.questions[screen.index]}
            index={screen.index}
            responses={responses}
            fibGrading={fibGrading}
          />
        )}
        {screen.name === 'code' && showJoinCode && (
          <JoinCodeScreen session={session} />
        )}
        {screen.name === 'settings' && (
          <QuizSettingsScreen
            session={session}
            config={config}
            hideLiveScoreboard={hideLiveScoreboard || assessmentOnly}
            assessmentOnly={assessmentOnly}
            hasNames={Object.keys(data.pinToName).length > 0}
            onUpdateSession={handleUpdateSession}
            onUpdateConfig={onUpdateConfig}
          />
        )}
      </div>

      {presenting && (
        <PresentSession
          session={session}
          currentQ={currentQ}
          responses={responses}
          answered={data.answeredCurrent}
          counts={data.counts}
          total={data.totalStudents}
          standings={standings}
          isGamified={isGame || data.isGamified}
          classAverage={gameStats ? gameStats.firstTryPct : classAverage}
          gameBoard={gameBoard ?? undefined}
          {...(isGame
            ? {
                showNames: gameNames,
                onToggleNames: () => setGameNames((v) => !v),
              }
            : {})}
          hasMedia={presentHasMedia}
          onSavePauseMessage={(message) =>
            handleUpdateSession({ pauseMessage: message })
          }
          onBlocked={() => {
            setPresenting(false);
            addToast(
              'Allow pop-ups for this site to present to the class.',
              'error'
            );
          }}
          onExit={() => setPresenting(false)}
        />
      )}

      {onHome && (
        <div
          className="flex flex-wrap items-center border-t border-brand-gray-lightest shrink-0"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
          }}
        >
          {(onPause ?? onResume) &&
            !perPeriod &&
            !isGame &&
            session.status !== 'ended' && (
              <button
                onClick={handleTogglePause}
                disabled={toggling}
                {...tourAttr('quiz.pause-resume', widgetId, tourType)}
                className="inline-flex items-center bg-brand-blue-primary hover:bg-brand-blue-light text-white font-sans font-semibold rounded-md transition-colors disabled:opacity-60"
                style={{
                  gap: 'min(6px, 1.5cqmin)',
                  padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
                  fontSize: 'min(13px, 4.5cqmin)',
                }}
              >
                {toggling ? (
                  <Loader2
                    className="animate-spin"
                    style={{
                      width: 'min(14px, 4.5cqmin)',
                      height: 'min(14px, 4.5cqmin)',
                    }}
                  />
                ) : session.status === 'paused' ? (
                  <Play
                    style={{
                      width: 'min(14px, 4.5cqmin)',
                      height: 'min(14px, 4.5cqmin)',
                    }}
                  />
                ) : (
                  <Pause
                    style={{
                      width: 'min(14px, 4.5cqmin)',
                      height: 'min(14px, 4.5cqmin)',
                    }}
                  />
                )}
                {session.status === 'paused' ? 'Resume' : 'Pause'}
              </button>
            )}
          {isGame && session.status !== 'ended' && (
            <GameControls
              phase={gameClock.phase}
              busy={gameControls.busy}
              showNames={gameNames}
              onStart={() => void gameControls.start()}
              onTogglePause={() => void gameControls.togglePause()}
              onAddMinute={() => void gameControls.addMinute()}
              onToggleNames={() => setGameNames((v) => !v)}
              tour={{
                start: tourAttr('review-game.start', widgetId, tourType),
                pause: tourAttr('review-game.pause', widgetId, tourType),
                addMinute: tourAttr(
                  'review-game.add-minute',
                  widgetId,
                  tourType
                ),
                names: tourAttr('review-game.names', widgetId, tourType),
              }}
            />
          )}
          <button
            onClick={handleEnd}
            disabled={ending || outward.locked}
            title={outward.lockedTitle}
            {...tourAttr('quiz.end-quiz', widgetId, tourType)}
            className="inline-flex items-center whitespace-nowrap bg-white border border-brand-gray-lighter hover:border-brand-red-light text-brand-red-primary font-sans font-semibold rounded-md transition-colors disabled:opacity-60"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
              fontSize: 'min(13px, 4.5cqmin)',
            }}
          >
            {ending ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(14px, 4.5cqmin)',
                  height: 'min(14px, 4.5cqmin)',
                }}
              />
            ) : (
              <Square
                style={{
                  width: 'min(14px, 4.5cqmin)',
                  height: 'min(14px, 4.5cqmin)',
                }}
              />
            )}
            {isGame ? 'End game' : 'End'}
          </button>
          <div ref={menuRef} className="relative ml-auto">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              aria-expanded={menuOpen}
              {...tourAttr('quiz.more-actions', widgetId, tourType)}
              className="rounded-md border border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light transition-colors"
              style={{ padding: 'min(8px, 2cqmin)' }}
            >
              <MoreHorizontal
                style={{
                  width: 'min(16px, 5cqmin)',
                  height: 'min(16px, 5cqmin)',
                }}
              />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 bottom-full bg-white border border-brand-gray-lighter rounded-lg shadow-lg overflow-hidden"
                style={{
                  zIndex: Z_INDEX.dropdown,
                  marginBottom: 'min(6px, 1.5cqmin)',
                  minWidth: 'min(200px, 70cqw)',
                }}
              >
                {menuItems.map((item) => (
                  <React.Fragment key={item.label}>
                    {item.divider && (
                      <div className="border-t border-brand-gray-lightest" />
                    )}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        item.onClick();
                      }}
                      {...(item.label === 'Reveal answer to class' ||
                      item.label === 'Hide revealed answer'
                        ? tourAttr('quiz.reveal-answer', widgetId, tourType)
                        : {})}
                      className="flex items-center w-full text-left font-sans text-brand-gray-dark hover:bg-brand-blue-lighter transition-colors"
                      style={{
                        gap: 'min(8px, 2cqmin)',
                        fontSize: 'min(12px, 4cqmin)',
                        padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                      }}
                    >
                      <item.icon
                        className="text-brand-blue-primary"
                        aria-hidden
                        style={{
                          width: 'min(14px, 4.5cqmin)',
                          height: 'min(14px, 4.5cqmin)',
                        }}
                      />
                      {item.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isReviewing && session.showPodiumBetweenQuestions && !assessmentOnly && (
        <div
          className="absolute inset-0 bg-brand-blue-dark/95 text-white flex flex-col items-center overflow-y-auto"
          style={{
            zIndex: Z_INDEX.widgetInternalOverlay,
            gap: 'min(12px, 3cqmin)',
            padding: 'min(16px, 4cqmin)',
          }}
        >
          <Trophy
            className="text-amber-400 shrink-0 mt-auto"
            aria-hidden
            style={{
              width: 'min(32px, 12cqmin)',
              height: 'min(32px, 12cqmin)',
            }}
          />
          <p
            className="font-sans font-bold"
            style={{ fontSize: 'min(18px, 7cqmin)' }}
          >
            Top of the board
          </p>
          {data.students
            .filter((s) => s.response.answers.length > 0)
            .map((s) => ({
              key: s.key,
              name: s.name,
              score: getDisplayScore(
                s.response,
                quizData.questions,
                session,
                fibGrading
              ),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, boardRankRows(session.boardRankLimit))
            .map((s, i) => (
              <p
                key={s.key}
                className="font-sans tabular-nums"
                style={{ fontSize: 'min(15px, 5.5cqmin)' }}
              >
                {rankOrdinal(i + 1)} · {s.name} — {s.score}
                {data.isGamified ? ' pts' : '%'}
              </p>
            ))}
          <span aria-hidden className="mb-auto" />
        </div>
      )}
    </div>
  );
};

const footerButton =
  'inline-flex items-center whitespace-nowrap font-sans font-semibold rounded-md transition-colors disabled:opacity-60';
const footerButtonStyle = {
  gap: 'min(6px, 1.5cqmin)',
  padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
  fontSize: 'min(13px, 4.5cqmin)',
};
const footerIcon = {
  width: 'min(14px, 4.5cqmin)',
  height: 'min(14px, 4.5cqmin)',
};

/** Review game footer (plan D26): Start or Pause, +1 min and the names toggle. */
const GameControls: React.FC<{
  phase: 'waiting' | 'running' | 'paused' | 'over';
  busy: boolean;
  showNames: boolean;
  onStart: () => void;
  onTogglePause: () => void;
  onAddMinute: () => void;
  onToggleNames: () => void;
  tour: Record<
    'start' | 'pause' | 'addMinute' | 'names',
    Record<string, string>
  >;
}> = ({
  phase,
  busy,
  showNames,
  onStart,
  onTogglePause,
  onAddMinute,
  onToggleNames,
  tour,
}) => (
  <>
    {phase === 'waiting' ? (
      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        {...tour.start}
        className={`${footerButton} bg-brand-blue-primary hover:bg-brand-blue-light text-white`}
        style={footerButtonStyle}
      >
        {busy ? (
          <Loader2 className="animate-spin" style={footerIcon} />
        ) : (
          <Play style={footerIcon} aria-hidden />
        )}
        Start game
      </button>
    ) : (
      <>
        {phase !== 'over' && (
          <button
            type="button"
            onClick={onTogglePause}
            disabled={busy}
            {...tour.pause}
            className={`${footerButton} bg-brand-blue-primary hover:bg-brand-blue-light text-white`}
            style={footerButtonStyle}
          >
            {phase === 'paused' ? (
              <Play style={footerIcon} aria-hidden />
            ) : (
              <Pause style={footerIcon} aria-hidden />
            )}
            {phase === 'paused' ? 'Resume' : 'Pause'}
          </button>
        )}
        <button
          type="button"
          onClick={onAddMinute}
          disabled={busy}
          {...tour.addMinute}
          className={`${footerButton} bg-white border border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light`}
          style={footerButtonStyle}
        >
          <Plus style={footerIcon} aria-hidden />1 min
        </button>
      </>
    )}
    <button
      type="button"
      onClick={onToggleNames}
      aria-pressed={showNames}
      {...tour.names}
      className={`${footerButton} border ${
        showNames
          ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
          : 'bg-white border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light'
      }`}
      style={footerButtonStyle}
    >
      <Users style={footerIcon} aria-hidden />
      {showNames ? 'Names on' : 'Names off'}
    </button>
  </>
);
