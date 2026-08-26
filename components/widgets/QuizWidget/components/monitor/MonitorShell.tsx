import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Settings,
  Square,
  Trophy,
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
} from '@/types';
import { db } from '@/config/firebase';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { useClickOutside } from '@/hooks/useClickOutside';
import { logError } from '@/utils/logError';
import {
  playPodiumFanfare,
  playQuizCompleteCelebration,
} from '@/utils/quizAudio';
import {
  buildLiveLeaderboard,
  getDisplayScore,
  isGamificationActive,
} from '../../utils/quizScoreboard';
import { Z_INDEX } from '@/config/zIndex';
import { useMonitorData } from './useMonitorData';
import { CurrentQuestionCard } from './CurrentQuestionCard';
import { StatusBuckets, BucketKey } from './StatusBuckets';
import { RosterList } from './RosterList';
import { QuestionResults, QuestionDetail } from './QuestionResults';
import { JoinCodeScreen } from './JoinCodeScreen';
import { PresentMode } from './PresentMode';
import { QuizSettingsScreen } from './QuizSettingsScreen';

export interface QuizLiveMonitorProps {
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
  } = props;

  const { showConfirm } = useDialog();
  const { addToast } = useDashboard();
  const data = useMonitorData(session, responses, quizData, config, rosters);

  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  // Reset local navigation when the monitored session changes.
  const [prevSessionId, setPrevSessionId] = useState(session.id);
  if (session.id !== prevSessionId) {
    setPrevSessionId(session.id);
    setScreen({ name: 'home' });
    setOpenBucket(null);
    setPresenting(false);
  }

  const scoringConfig = {
    speedBonusEnabled: session.speedBonusEnabled,
    streakBonusEnabled: session.streakBonusEnabled,
  };

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
      session.status === 'active' && isGamificationActive(scoringConfig);
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
      const entries = buildLiveLeaderboard(
        responses,
        quizData.questions,
        scoringConfig,
        data.pinToName,
        data.byStudentUid
      );
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
  ]);

  // Sound cues on review phase and session end.
  const isReviewing = session.questionPhase === 'reviewing';
  const prevReviewingRef = useRef(isReviewing);
  useEffect(() => {
    if (!prevReviewingRef.current && isReviewing) {
      if (session.soundEffectsEnabled && !soundMuted) playPodiumFanfare();
    }
    prevReviewingRef.current = isReviewing;
  }, [isReviewing, session.soundEffectsEnabled, soundMuted]);
  const prevStatusRef = useRef(session.status);
  useEffect(() => {
    if (prevStatusRef.current === 'active' && session.status === 'ended') {
      if (session.soundEffectsEnabled && !soundMuted)
        playQuizCompleteCelebration();
    }
    prevStatusRef.current = session.status;
  }, [session.status, session.soundEffectsEnabled, soundMuted]);

  const handleEnd = async () => {
    const ok = await showConfirm(
      'Make this assignment inactive? The student link stops working, but all responses are preserved in the archive.',
      {
        title: 'Make Inactive',
        variant: 'warning',
        confirmLabel: 'Make Inactive',
      }
    );
    if (!ok) return;
    setEnding(true);
    try {
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
    if (!session.code) return;
    void navigator.clipboard.writeText(
      `${window.location.origin}/quiz?code=${session.code}`
    );
    addToast('Join link copied.', 'success');
  };

  const currentQ = data.currentQ;
  const revealed = currentQ
    ? session.revealedAnswers?.[currentQ.id]
    : undefined;
  const canReveal =
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
      label: 'Present to class',
      icon: MonitorPlay,
      onClick: () => setPresenting(true),
    },
    {
      label: 'Question results',
      icon: BarChart3,
      onClick: () => setScreen({ name: 'questions' }),
    },
    ...(session.code
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
    ...(session.soundEffectsEnabled
      ? [
          {
            label: soundMuted ? 'Unmute sounds' : 'Mute sounds',
            icon: soundMuted ? VolumeX : Volume2,
            onClick: () => setSoundMuted((v) => !v),
            divider: !canReveal && !session.code,
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
          <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
            {data.periodNames.length > 1 && (
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
            <CurrentQuestionCard
              session={session}
              currentQ={currentQ}
              answered={data.answeredCurrent}
              total={data.totalStudents}
              doneCount={data.counts.done}
              onAdvance={onAdvance}
            />
            <StatusBuckets
              counts={data.counts}
              needsHelpCount={data.needsHelpCount}
              openBucket={openBucket}
              onToggle={(key) =>
                setOpenBucket((cur) => (cur === key ? null : key))
              }
            />
            {openBucket && (
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
          />
        )}
        {screen.name === 'code' && <JoinCodeScreen session={session} />}
        {screen.name === 'settings' && (
          <QuizSettingsScreen
            session={session}
            config={config}
            hideLiveScoreboard={hideLiveScoreboard}
            hasNames={Object.keys(data.pinToName).length > 0}
            onUpdateSession={handleUpdateSession}
            onUpdateConfig={onUpdateConfig}
          />
        )}
      </div>

      {onHome && (
        <div
          className="flex items-center border-t border-brand-gray-lightest shrink-0"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
          }}
        >
          {(onPause ?? onResume) && session.status !== 'ended' && (
            <button
              onClick={handleTogglePause}
              disabled={toggling}
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
          <button
            onClick={handleEnd}
            disabled={ending}
            className="inline-flex items-center bg-white border border-brand-gray-lighter hover:border-brand-red-light text-brand-red-primary font-sans font-semibold rounded-md transition-colors disabled:opacity-60"
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
            End
          </button>
          <div ref={menuRef} className="relative ml-auto">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              aria-expanded={menuOpen}
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

      {isReviewing && session.showPodiumBetweenQuestions && (
        <div
          className="absolute inset-0 bg-brand-blue-dark/95 text-white flex flex-col items-center justify-center"
          style={{
            zIndex: Z_INDEX.widgetInternalOverlay,
            gap: 'min(12px, 3cqmin)',
            padding: 'min(16px, 4cqmin)',
          }}
        >
          <Trophy
            className="text-amber-400"
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
              score: getDisplayScore(s.response, quizData.questions, session),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((s, i) => (
              <p
                key={s.key}
                className="font-sans tabular-nums"
                style={{ fontSize: 'min(15px, 5.5cqmin)' }}
              >
                {['1st', '2nd', '3rd'][i]} · {s.name} — {s.score}
                {data.isGamified ? ' pts' : '%'}
              </p>
            ))}
        </div>
      )}

      {presenting && (
        <PresentMode
          session={session}
          currentQ={currentQ}
          answered={data.answeredCurrent}
          doneCount={data.counts.done}
          total={data.totalStudents}
          onExit={() => setPresenting(false)}
        />
      )}
    </div>
  );
};
