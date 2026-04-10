/**
 * QuizLiveMonitor — teacher view during a live quiz session.
 * Shows join code, student progress, current question controls,
 * and real-time per-question answer distribution.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  Copy,
  CheckCircle2,
  Clock,
  Users,
  ChevronRight,
  Square,
  BarChart3,
  Loader2,
  ExternalLink,
  Zap,
  User,
  AlertTriangle,
  Eye,
  EyeOff,
  Trophy,
  Hash,
  X,
  Volume2,
  VolumeX,
  Palette,
  Medal,
} from 'lucide-react';
import {
  QuizSession,
  QuizResponse,
  QuizQuestion,
  QuizData,
  QuizConfig,
  ClassRoster,
} from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import {
  buildPinToNameMap,
  getDisplayScore,
  getScoreSuffix,
} from '../utils/quizScoreboard';
import { useClickOutside } from '@/hooks/useClickOutside';
import {
  playPodiumFanfare,
  playQuizCompleteCelebration,
} from '@/utils/quizAudio';

interface QuizLiveMonitorProps {
  session: QuizSession;
  responses: QuizResponse[];
  quizData: QuizData;
  onAdvance: () => Promise<void>;
  onEnd: () => Promise<void>;
  config: QuizConfig;
  rosters: ClassRoster[];
  onUpdateConfig: (updates: Partial<QuizConfig>) => void;
  onRemoveStudent?: (studentUid: string) => Promise<void>;
  onRevealAnswer?: (questionId: string, correctAnswer: string) => Promise<void>;
  onHideAnswer?: (questionId: string) => Promise<void>;
}

export const QuizLiveMonitor: React.FC<QuizLiveMonitorProps> = ({
  session,
  responses,
  quizData,
  onAdvance,
  onEnd,
  config,
  rosters,
  onUpdateConfig,
  onRemoveStudent,
  onRevealAnswer,
  onHideAnswer,
}) => {
  const pinToName = useMemo(
    () => buildPinToNameMap(rosters, config.periodName),
    [rosters, config.periodName]
  );
  const hasNames = Object.keys(pinToName).length > 0;

  const [copied, setCopied] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  const [showLiveScoreboardSetup, setShowLiveScoreboardSetup] = useState(false);
  const [liveScoreboardMode, setLiveScoreboardMode] = useState<'pin' | 'name'>(
    hasNames ? 'name' : 'pin'
  );
  const [liveScoreboardScoring, setLiveScoreboardScoring] = useState<
    'completion' | 'per-question'
  >('per-question');
  const liveScoreboardSetupRef = useRef<HTMLDivElement>(null);
  const isLiveScoreboardActive = config.liveScoreboardEnabled ?? false;

  // New state for Phase 1 & 2 features
  const [showAnswerColors, setShowAnswerColors] = useState(false);
  const [showTabWarnings, setShowTabWarnings] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [soundMuted, setSoundMuted] = useState(false);
  const [expandedStat, setExpandedStat] = useState<
    'joined' | 'active' | 'finished' | null
  >(null);
  const isReviewing = session.questionPhase === 'reviewing';

  // Close live scoreboard setup popup on click-outside or Escape
  const closeLiveScoreboardSetup = useCallback(() => {
    setShowLiveScoreboardSetup(false);
  }, []);
  useClickOutside(liveScoreboardSetupRef, closeLiveScoreboardSetup);
  useEffect(() => {
    if (!showLiveScoreboardSetup) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLiveScoreboardSetup(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showLiveScoreboardSetup]);

  const handleToggleLiveScoreboard = () => {
    if (isLiveScoreboardActive) {
      // Turn off
      onUpdateConfig({
        liveScoreboardEnabled: false,
      });
    } else {
      // Show setup popup
      setShowLiveScoreboardSetup(true);
    }
  };

  const handleEnableLiveScoreboard = () => {
    setShowLiveScoreboardSetup(false);
    onUpdateConfig({
      liveScoreboardEnabled: true,
      liveScoreboardMode: liveScoreboardMode,
      liveScoreboardScoring: liveScoreboardScoring,
    });
  };

  // Sync auto-countdown with session timestamp
  useEffect(() => {
    if (!session.autoProgressAt) {
      setAutoCountdown(null);
      return;
    }
    const update = () => {
      if (!session.autoProgressAt) return;
      const remaining = Math.max(
        0,
        Math.round((session.autoProgressAt - Date.now()) / 1000)
      );
      setAutoCountdown(remaining);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [session.autoProgressAt]);

  // Play podium fanfare when entering review phase
  const prevReviewingRef = useRef(isReviewing);
  useEffect(() => {
    if (isReviewing && !prevReviewingRef.current) {
      if (session.soundEffectsEnabled && !soundMuted) {
        playPodiumFanfare();
      }
    }
    prevReviewingRef.current = isReviewing;
  }, [isReviewing, session.soundEffectsEnabled, soundMuted]);

  // Play celebration sound once when quiz transitions to ended
  const prevSessionStatusRef = useRef(session.status);
  useEffect(() => {
    const didJustEnd =
      prevSessionStatusRef.current === 'active' && session.status === 'ended';
    if (didJustEnd && session.soundEffectsEnabled && !soundMuted) {
      playQuizCompleteCelebration();
    }
    prevSessionStatusRef.current = session.status;
  }, [session.status, session.soundEffectsEnabled, soundMuted]);

  const isActive = session.status === 'active';
  const joinUrl = `${window.location.origin}/quiz?code=${session.code}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      await onAdvance();
    } finally {
      setAdvancing(false);
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    try {
      await onEnd();
    } finally {
      setEnding(false);
    }
  };

  const currentQ: QuizQuestion | undefined =
    session.currentQuestionIndex >= 0
      ? quizData.questions[session.currentQuestionIndex]
      : undefined;

  // ⚡ Bolt: Optimize multiple array iterations inside the render loop
  // Instead of 4 separate .filter() passes, calculate all stats in one O(N) loop
  const { answered, completed, inProgress, joined, studentsByStatus } =
    React.useMemo(() => {
      let _answered = 0;
      let _completed = 0;
      let _inProgress = 0;
      let _joined = 0;
      const byStatus: {
        joined: { pin: string; name: string }[];
        active: { pin: string; name: string }[];
        finished: { pin: string; name: string }[];
      } = { joined: [], active: [], finished: [] };

      for (const r of responses) {
        if (currentQ && r.answers.some((a) => a.questionId === currentQ.id)) {
          _answered++;
        }
        const name = pinToName[r.pin] ?? `PIN ${r.pin}`;
        if (r.status === 'completed') {
          _completed++;
          byStatus.finished.push({ pin: r.pin, name });
        } else if (r.status === 'in-progress') {
          _inProgress++;
          byStatus.active.push({ pin: r.pin, name });
        } else if (r.status === 'joined') {
          _joined++;
          byStatus.joined.push({ pin: r.pin, name });
        }
      }

      return {
        answered: _answered,
        completed: _completed,
        inProgress: _inProgress,
        joined: _joined,
        studentsByStatus: byStatus,
      };
    }, [responses, currentQ, pinToName]);

  const modeIcon =
    session.sessionMode === 'auto' ? (
      <Zap className="w-3.5 h-3.5" />
    ) : session.sessionMode === 'student' ? (
      <Clock className="w-3.5 h-3.5" />
    ) : (
      <User className="w-3.5 h-3.5" />
    );

  const modeLabel =
    session.sessionMode === 'auto'
      ? 'Auto-progress'
      : session.sessionMode === 'student'
        ? 'Self-paced'
        : 'Teacher-paced';

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div
        className="border-b border-brand-red-primary/10"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <div className="flex items-center justify-between">
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <div
              className="rounded-full bg-brand-red-primary animate-pulse shadow-[0_0_8px_rgba(173,33,34,0.5)]"
              style={{
                width: 'min(10px, 2.5cqmin)',
                height: 'min(10px, 2.5cqmin)',
              }}
            />
            <div className="flex flex-col">
              <div
                className="flex items-center gap-1.5 font-black text-brand-red-primary leading-none uppercase tracking-tight"
                style={{ fontSize: 'min(12px, 4cqmin)' }}
              >
                {modeIcon}
                <span>{modeLabel}</span>
              </div>
              <span
                className="text-brand-blue-dark font-bold truncate"
                style={{ fontSize: 'min(11px, 3.5cqmin)', maxWidth: '140px' }}
              >
                {session.quizTitle}
              </span>
            </div>
          </div>
          <button
            onClick={() => void handleEnd()}
            disabled={ending}
            className="flex items-center bg-brand-red-primary hover:bg-brand-red-dark disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-md active:scale-95"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
              fontSize: 'min(11px, 3.5cqmin)',
            }}
          >
            {ending ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            ) : (
              <Square
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            )}
            END
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(16px, 4cqmin)' }}
      >
        <div
          className="flex flex-col"
          style={{ gap: isActive ? 'min(8px, 2cqmin)' : 'min(16px, 4cqmin)' }}
        >
          {/* ── ACTIVE STATE: restructured layout with question at top ── */}
          {isActive && currentQ && (
            <>
              {/* 1. QUESTION — hero content at the very top */}
              <div className="relative">
                {autoCountdown !== null && (
                  <div
                    className="absolute top-0 left-0 right-0 rounded-full overflow-hidden bg-brand-blue-lighter"
                    style={{ height: 'min(4px, 1cqmin)' }}
                  >
                    <div
                      className="h-full bg-brand-red-primary transition-all duration-1000 ease-linear"
                      style={{ width: `${(autoCountdown / 5) * 100}%` }}
                    />
                  </div>
                )}
                <div
                  className="flex items-center flex-wrap"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    marginBottom: 'min(4px, 1cqmin)',
                    marginTop:
                      autoCountdown !== null ? 'min(6px, 1.5cqmin)' : undefined,
                  }}
                >
                  <span
                    className="bg-brand-blue-primary text-white font-bold rounded-lg"
                    style={{
                      fontSize: 'min(10px, 3cqmin)',
                      padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Q{session.currentQuestionIndex + 1}/{session.totalQuestions}
                  </span>
                  <span
                    className={`font-bold rounded-lg ${
                      currentQ.type === 'MC'
                        ? 'bg-blue-100 text-blue-700'
                        : currentQ.type === 'FIB'
                          ? 'bg-amber-100 text-amber-700'
                          : currentQ.type === 'Matching'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-teal-100 text-teal-700'
                    }`}
                    style={{
                      fontSize: 'min(9px, 2.5cqmin)',
                      padding: 'min(2px, 0.5cqmin) min(6px, 1.5cqmin)',
                    }}
                  >
                    {currentQ.type}
                  </span>
                  {currentQ.timeLimit > 0 && (
                    <span
                      className="flex items-center gap-0.5 text-slate-500 font-bold"
                      style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                    >
                      <Clock
                        style={{
                          width: 'min(10px, 2.5cqmin)',
                          height: 'min(10px, 2.5cqmin)',
                        }}
                      />
                      {currentQ.timeLimit}s
                    </span>
                  )}
                  {autoCountdown !== null && (
                    <div
                      className="flex items-center gap-0.5 text-brand-red-primary font-black animate-pulse"
                      style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                    >
                      <Zap
                        className="fill-current"
                        style={{
                          width: 'min(10px, 2.5cqmin)',
                          height: 'min(10px, 2.5cqmin)',
                        }}
                      />
                      {autoCountdown}s
                    </div>
                  )}
                  <button
                    onClick={() => setShowStats(!showStats)}
                    className="ml-auto flex items-center text-brand-blue-primary font-bold hover:underline"
                    style={{
                      gap: 'min(3px, 0.7cqmin)',
                      fontSize: 'min(10px, 3cqmin)',
                    }}
                  >
                    <BarChart3
                      style={{
                        width: 'min(12px, 3cqmin)',
                        height: 'min(12px, 3cqmin)',
                      }}
                    />
                    {showStats ? 'Hide' : 'Stats'}
                  </button>
                </div>
                <p
                  className="text-brand-blue-dark font-black"
                  style={{
                    fontSize: 'min(28px, 12cqmin)',
                    lineHeight: 1.15,
                  }}
                >
                  {currentQ.text}
                </p>

                {/* Correct answer on board — always visible during review phase */}
                {((session.showCorrectOnBoard ?? false) || isReviewing) &&
                  session.revealedAnswers?.[currentQ.id] && (
                    <div
                      className="bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between"
                      style={{
                        fontSize: 'min(13px, 4.5cqmin)',
                        marginTop: 'min(6px, 1.5cqmin)',
                        padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                      }}
                    >
                      <div>
                        <span className="text-emerald-600 font-black">✓ </span>
                        <span className="text-emerald-800 font-bold">
                          {session.revealedAnswers[currentQ.id]}
                        </span>
                      </div>
                      {onHideAnswer && (
                        <button
                          onClick={() => void onHideAnswer(currentQ.id)}
                          className="text-emerald-500 hover:text-emerald-700 transition-colors ml-2 shrink-0"
                          title="Hide answer"
                        >
                          <EyeOff
                            style={{
                              width: 'min(14px, 3.5cqmin)',
                              height: 'min(14px, 3.5cqmin)',
                            }}
                          />
                        </button>
                      )}
                    </div>
                  )}

                {/* Reveal answer button */}
                {session.showCorrectOnBoard &&
                  !session.revealedAnswers?.[currentQ.id] &&
                  onRevealAnswer && (
                    <button
                      onClick={() =>
                        void onRevealAnswer(currentQ.id, currentQ.correctAnswer)
                      }
                      className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-bold transition-colors"
                      style={{
                        fontSize: 'min(11px, 3.5cqmin)',
                        marginTop: 'min(6px, 1.5cqmin)',
                      }}
                    >
                      <Eye
                        style={{
                          width: 'min(14px, 3.5cqmin)',
                          height: 'min(14px, 3.5cqmin)',
                        }}
                      />
                      Reveal Answer
                    </button>
                  )}

                {/* Completion progress bar */}
                <div style={{ marginTop: 'min(8px, 2cqmin)' }}>
                  <div
                    className="flex items-center justify-between text-brand-gray-primary font-bold uppercase tracking-wider"
                    style={{
                      fontSize: 'min(9px, 2.5cqmin)',
                      marginBottom: 'min(3px, 0.7cqmin)',
                    }}
                  >
                    <span>Answered</span>
                    <span>
                      {answered} / {responses.length}
                    </span>
                  </div>
                  <div
                    className="bg-brand-blue-lighter rounded-full overflow-hidden shadow-inner border border-brand-blue-primary/5"
                    style={{ height: 'min(8px, 2cqmin)' }}
                  >
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                      style={{
                        width: `${responses.length > 0 ? (answered / responses.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Live answer distribution (MC only) */}
                {showStats && currentQ.type === 'MC' && (
                  <div
                    className="border-t border-brand-blue-primary/5"
                    style={{
                      marginTop: 'min(8px, 2cqmin)',
                      paddingTop: 'min(8px, 2cqmin)',
                    }}
                  >
                    <MCDistribution question={currentQ} responses={responses} />
                  </div>
                )}
              </div>

              {/* Podium overlay between questions (review phase) */}
              {isReviewing && session.showPodiumBetweenQuestions && (
                <PodiumView
                  responses={responses}
                  questions={quizData.questions}
                  session={session}
                  pinToName={pinToName}
                  onDismiss={() => {
                    /* persists until teacher clicks advance */
                  }}
                />
              )}

              {/* 2. INTERACTIVE STAT BOXES — tappable to show students */}
              <div
                className="grid grid-cols-3"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                style={{ gap: 'min(4px, 1cqmin)', touchAction: 'auto' }}
              >
                <InteractiveStatBox
                  label="Joined"
                  value={joined + inProgress + completed}
                  icon={
                    <Users
                      style={{
                        width: 'min(12px, 3.5cqmin)',
                        height: 'min(12px, 3.5cqmin)',
                      }}
                    />
                  }
                  color="blue"
                  expanded={expandedStat === 'joined'}
                  onToggle={() =>
                    setExpandedStat(expandedStat === 'joined' ? null : 'joined')
                  }
                  students={[
                    ...studentsByStatus.joined,
                    ...studentsByStatus.active,
                    ...studentsByStatus.finished,
                  ]}
                />
                <InteractiveStatBox
                  label="Active"
                  value={inProgress}
                  icon={
                    <Clock
                      style={{
                        width: 'min(12px, 3.5cqmin)',
                        height: 'min(12px, 3.5cqmin)',
                      }}
                    />
                  }
                  color="amber"
                  expanded={expandedStat === 'active'}
                  onToggle={() =>
                    setExpandedStat(expandedStat === 'active' ? null : 'active')
                  }
                  students={studentsByStatus.active}
                />
                <InteractiveStatBox
                  label="Finished"
                  value={completed}
                  icon={
                    <CheckCircle2
                      style={{
                        width: 'min(12px, 3.5cqmin)',
                        height: 'min(12px, 3.5cqmin)',
                      }}
                    />
                  }
                  color="green"
                  expanded={expandedStat === 'finished'}
                  onToggle={() =>
                    setExpandedStat(
                      expandedStat === 'finished' ? null : 'finished'
                    )
                  }
                  students={studentsByStatus.finished}
                />
              </div>

              {/* 3. JOIN CODE bar (compact) */}
              <div
                className="flex items-center bg-white border border-brand-blue-primary/10 rounded-xl shadow-sm"
                style={{
                  padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                  gap: 'min(6px, 1.5cqmin)',
                }}
              >
                <span
                  className="font-black tracking-[0.15em] text-brand-blue-dark font-mono bg-brand-blue-lighter/40 rounded-lg border border-brand-blue-primary/5"
                  style={{
                    fontSize: 'min(13px, 3.5cqmin)',
                    padding: 'min(3px, 0.7cqmin) min(8px, 2cqmin)',
                  }}
                >
                  {session.code}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center bg-brand-blue-lighter hover:bg-brand-blue-primary/20 text-brand-blue-primary font-bold rounded-lg transition-all active:scale-95"
                  style={{
                    gap: 'min(3px, 0.7cqmin)',
                    padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                    fontSize: 'min(9px, 2.5cqmin)',
                  }}
                >
                  {copied ? (
                    <CheckCircle2
                      className="text-emerald-600"
                      style={{
                        width: 'min(12px, 3cqmin)',
                        height: 'min(12px, 3cqmin)',
                      }}
                    />
                  ) : (
                    <Copy
                      style={{
                        width: 'min(12px, 3cqmin)',
                        height: 'min(12px, 3cqmin)',
                      }}
                    />
                  )}
                  {copied ? 'COPIED' : 'COPY'}
                </button>
                <a
                  href={joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-lg transition-all shadow-sm active:scale-95"
                  style={{
                    gap: 'min(3px, 0.7cqmin)',
                    padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                    fontSize: 'min(9px, 2.5cqmin)',
                  }}
                >
                  <ExternalLink
                    style={{
                      width: 'min(12px, 3cqmin)',
                      height: 'min(12px, 3cqmin)',
                    }}
                  />
                  OPEN
                </a>
                {/* Sound mute toggle */}
                {session.soundEffectsEnabled && (
                  <button
                    onClick={() => setSoundMuted((m) => !m)}
                    className={`ml-auto flex items-center rounded-lg transition-all active:scale-95 ${
                      soundMuted
                        ? 'text-slate-400 hover:bg-slate-100'
                        : 'text-brand-blue-primary hover:bg-brand-blue-lighter/50'
                    }`}
                    style={{ padding: 'min(4px, 1cqmin)' }}
                    title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
                  >
                    {soundMuted ? (
                      <VolumeX
                        style={{
                          width: 'min(14px, 3.5cqmin)',
                          height: 'min(14px, 3.5cqmin)',
                        }}
                      />
                    ) : (
                      <Volume2
                        style={{
                          width: 'min(14px, 3.5cqmin)',
                          height: 'min(14px, 3.5cqmin)',
                        }}
                      />
                    )}
                  </button>
                )}
              </div>

              {/* 4. Live Scoreboard Toggle (compact) */}
              <div className="relative">
                <button
                  onClick={handleToggleLiveScoreboard}
                  className={`w-full flex items-center justify-center font-bold rounded-xl transition-all active:scale-95 border ${
                    isLiveScoreboardActive
                      ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/20'
                      : 'bg-white hover:bg-amber-50 text-amber-600 border-amber-200'
                  }`}
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    padding: 'min(5px, 1.2cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'min(10px, 3cqmin)',
                  }}
                >
                  <Trophy
                    className={isLiveScoreboardActive ? 'animate-pulse' : ''}
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                  {isLiveScoreboardActive
                    ? 'LIVE SCOREBOARD ON'
                    : 'ENABLE LIVE SCOREBOARD'}
                </button>
                {showLiveScoreboardSetup && (
                  <div
                    ref={liveScoreboardSetupRef}
                    className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-brand-blue-primary/10 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                    style={{ padding: 'min(16px, 4cqmin)' }}
                  >
                    <p
                      className="font-black text-brand-blue-dark text-center uppercase tracking-wider"
                      style={{
                        fontSize: 'min(11px, 3.5cqmin)',
                        marginBottom: 'min(12px, 3cqmin)',
                      }}
                    >
                      Live Scoreboard Setup
                    </p>

                    {/* Name/PIN choice */}
                    <p
                      className="font-bold text-slate-500 uppercase tracking-wider"
                      style={{
                        fontSize: 'min(9px, 2.5cqmin)',
                        marginBottom: 'min(6px, 1.5cqmin)',
                      }}
                    >
                      Display as
                    </p>
                    <div
                      className="flex"
                      style={{
                        gap: 'min(6px, 1.5cqmin)',
                        marginBottom: 'min(12px, 3cqmin)',
                      }}
                    >
                      <button
                        onClick={() => setLiveScoreboardMode('name')}
                        className={`flex-1 flex items-center justify-center font-bold rounded-xl transition-all ${
                          liveScoreboardMode === 'name'
                            ? 'bg-brand-blue-primary text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        disabled={!hasNames}
                        style={{
                          gap: 'min(4px, 1cqmin)',
                          padding: 'min(8px, 2cqmin)',
                          fontSize: 'min(10px, 3cqmin)',
                        }}
                      >
                        <User
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                        />
                        Names
                      </button>
                      <button
                        onClick={() => setLiveScoreboardMode('pin')}
                        className={`flex-1 flex items-center justify-center font-bold rounded-xl transition-all ${
                          liveScoreboardMode === 'pin'
                            ? 'bg-brand-blue-primary text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        style={{
                          gap: 'min(4px, 1cqmin)',
                          padding: 'min(8px, 2cqmin)',
                          fontSize: 'min(10px, 3cqmin)',
                        }}
                      >
                        <Hash
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                        />
                        PINs
                      </button>
                    </div>

                    {/* Scoring mode choice */}
                    <p
                      className="font-bold text-slate-500 uppercase tracking-wider"
                      style={{
                        fontSize: 'min(9px, 2.5cqmin)',
                        marginBottom: 'min(6px, 1.5cqmin)',
                      }}
                    >
                      Update scores
                    </p>
                    <div
                      className="flex flex-col"
                      style={{
                        gap: 'min(4px, 1cqmin)',
                        marginBottom: 'min(14px, 3.5cqmin)',
                      }}
                    >
                      <button
                        onClick={() => setLiveScoreboardScoring('completion')}
                        className={`flex items-center font-bold rounded-xl transition-all text-left ${
                          liveScoreboardScoring === 'completion'
                            ? 'bg-brand-blue-lighter text-brand-blue-dark ring-2 ring-brand-blue-primary/30'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                        style={{
                          padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
                          fontSize: 'min(10px, 3cqmin)',
                        }}
                      >
                        On quiz completion
                      </button>
                      <button
                        onClick={() => setLiveScoreboardScoring('per-question')}
                        className={`flex items-center font-bold rounded-xl transition-all text-left ${
                          liveScoreboardScoring === 'per-question'
                            ? 'bg-brand-blue-lighter text-brand-blue-dark ring-2 ring-brand-blue-primary/30'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                        style={{
                          padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
                          fontSize: 'min(10px, 3cqmin)',
                        }}
                      >
                        After each question
                      </button>
                    </div>

                    <button
                      onClick={handleEnableLiveScoreboard}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl transition-all active:scale-95 shadow-md"
                      style={{
                        padding: 'min(10px, 2.5cqmin)',
                        fontSize: 'min(11px, 3.5cqmin)',
                      }}
                    >
                      START LIVE SCOREBOARD
                    </button>
                  </div>
                )}
              </div>

              {/* 5. ROSTER show/hide + student list */}
              {responses.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-brand-blue-primary/10 pb-1">
                    <button
                      onClick={() => setShowRoster(!showRoster)}
                      className="flex items-center gap-1"
                    >
                      <span
                        className="text-brand-blue-primary/60 font-black uppercase tracking-widest"
                        style={{ fontSize: 'min(10px, 3cqmin)' }}
                      >
                        Roster · {responses.length}
                      </span>
                      {showRoster ? (
                        <EyeOff
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                          className="text-brand-blue-primary/40"
                        />
                      ) : (
                        <Eye
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                          className="text-brand-blue-primary/40"
                        />
                      )}
                    </button>
                    {showRoster && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowAnswerColors(!showAnswerColors)}
                          className={`flex items-center gap-1 font-bold rounded-md transition-all ${
                            showAnswerColors
                              ? 'text-brand-blue-primary bg-brand-blue-lighter/50'
                              : 'text-brand-blue-primary/40 hover:text-brand-blue-primary/60'
                          }`}
                          style={{
                            fontSize: 'min(9px, 2.5cqmin)',
                            padding: 'min(3px, 0.7cqmin) min(6px, 1.5cqmin)',
                          }}
                          title="Color-code answers for current question"
                        >
                          <Palette
                            style={{
                              width: 'min(12px, 3cqmin)',
                              height: 'min(12px, 3cqmin)',
                            }}
                          />
                          Colors
                        </button>
                        {session.tabWarningsEnabled !== false && (
                          <button
                            onClick={() => setShowTabWarnings(!showTabWarnings)}
                            className={`flex items-center gap-1 font-bold rounded-md transition-all ${
                              showTabWarnings
                                ? 'text-red-500 bg-red-50'
                                : 'text-brand-blue-primary/40 hover:text-brand-blue-primary/60'
                            }`}
                            style={{
                              fontSize: 'min(9px, 2.5cqmin)',
                              padding: 'min(3px, 0.7cqmin) min(6px, 1.5cqmin)',
                            }}
                            title="Show/hide tab switch warnings in roster"
                          >
                            <AlertTriangle
                              style={{
                                width: 'min(12px, 3cqmin)',
                                height: 'min(12px, 3cqmin)',
                              }}
                            />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {showRoster && (
                    <div
                      className="max-h-60 overflow-y-auto pr-1 custom-scrollbar"
                      style={{
                        gap: 'min(6px, 1.5cqmin)',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {responses
                        .slice()
                        .sort((a, b) => a.pin.localeCompare(b.pin))
                        .map((r) => (
                          <StudentRow
                            key={r.studentUid}
                            response={r}
                            totalQuestions={session.totalQuestions}
                            questions={quizData.questions}
                            currentQuestion={currentQ}
                            showAnswerColors={showAnswerColors}
                            showTabWarnings={
                              showTabWarnings &&
                              session.tabWarningsEnabled !== false
                            }
                            confirmRemove={confirmRemove === r.studentUid}
                            onConfirmRemoveToggle={() =>
                              setConfirmRemove(
                                confirmRemove === r.studentUid
                                  ? null
                                  : r.studentUid
                              )
                            }
                            onRemove={
                              onRemoveStudent
                                ? () => {
                                    void Promise.resolve(
                                      onRemoveStudent(r.studentUid)
                                    )
                                      .then(() => setConfirmRemove(null))
                                      .catch(() => undefined);
                                  }
                                : undefined
                            }
                            pinToName={pinToName}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── NON-ACTIVE STATES: waiting + ended (original layout) ── */}
          {!isActive && (
            <>
              {/* Join code bar (full size) */}
              <div
                className="flex items-center bg-white border border-brand-blue-primary/10 rounded-xl shadow-sm"
                style={{
                  padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                  gap: 'min(8px, 2cqmin)',
                }}
              >
                <span
                  className="font-black tracking-[0.15em] text-brand-blue-dark font-mono bg-brand-blue-lighter/40 rounded-lg border border-brand-blue-primary/5"
                  style={{
                    fontSize: 'min(18px, 5cqmin)',
                    padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
                  }}
                >
                  {session.code}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center bg-brand-blue-lighter hover:bg-brand-blue-primary/20 text-brand-blue-primary font-bold rounded-lg transition-all active:scale-95"
                  style={{
                    gap: 'min(4px, 1cqmin)',
                    padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'min(10px, 3cqmin)',
                  }}
                >
                  {copied ? (
                    <CheckCircle2
                      className="text-emerald-600"
                      style={{
                        width: 'min(14px, 3.5cqmin)',
                        height: 'min(14px, 3.5cqmin)',
                      }}
                    />
                  ) : (
                    <Copy
                      style={{
                        width: 'min(14px, 3.5cqmin)',
                        height: 'min(14px, 3.5cqmin)',
                      }}
                    />
                  )}
                  {copied ? 'COPIED' : 'COPY'}
                </button>
                <a
                  href={joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-lg transition-all shadow-sm active:scale-95"
                  style={{
                    gap: 'min(4px, 1cqmin)',
                    padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'min(10px, 3cqmin)',
                  }}
                >
                  <ExternalLink
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                  OPEN
                </a>
                {session.soundEffectsEnabled && (
                  <button
                    onClick={() => setSoundMuted((m) => !m)}
                    className={`ml-auto flex items-center rounded-lg transition-all active:scale-95 ${
                      soundMuted
                        ? 'text-slate-400 hover:bg-slate-100'
                        : 'text-brand-blue-primary hover:bg-brand-blue-lighter/50'
                    }`}
                    style={{ padding: 'min(6px, 1.5cqmin)' }}
                    title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
                  >
                    {soundMuted ? (
                      <VolumeX
                        style={{
                          width: 'min(16px, 4cqmin)',
                          height: 'min(16px, 4cqmin)',
                        }}
                      />
                    ) : (
                      <Volume2
                        style={{
                          width: 'min(16px, 4cqmin)',
                          height: 'min(16px, 4cqmin)',
                        }}
                      />
                    )}
                  </button>
                )}
              </div>

              {/* Live Scoreboard Toggle (full size) */}
              <div className="relative">
                <button
                  onClick={handleToggleLiveScoreboard}
                  className={`w-full flex items-center justify-center font-bold rounded-2xl transition-all active:scale-95 border ${
                    isLiveScoreboardActive
                      ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/20'
                      : 'bg-white hover:bg-amber-50 text-amber-600 border-amber-200'
                  }`}
                  style={{
                    gap: 'min(8px, 2cqmin)',
                    padding: 'min(10px, 2.5cqmin) min(16px, 4cqmin)',
                    fontSize: 'min(11px, 3.5cqmin)',
                  }}
                >
                  <Trophy
                    className={isLiveScoreboardActive ? 'animate-pulse' : ''}
                    style={{
                      width: 'min(16px, 4cqmin)',
                      height: 'min(16px, 4cqmin)',
                    }}
                  />
                  {isLiveScoreboardActive
                    ? 'LIVE SCOREBOARD ON'
                    : 'ENABLE LIVE SCOREBOARD'}
                </button>
                {showLiveScoreboardSetup && (
                  <div
                    ref={liveScoreboardSetupRef}
                    className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-brand-blue-primary/10 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                    style={{ padding: 'min(16px, 4cqmin)' }}
                  >
                    <p
                      className="font-black text-brand-blue-dark text-center uppercase tracking-wider"
                      style={{
                        fontSize: 'min(11px, 3.5cqmin)',
                        marginBottom: 'min(12px, 3cqmin)',
                      }}
                    >
                      Live Scoreboard Setup
                    </p>
                    <p
                      className="font-bold text-slate-500 uppercase tracking-wider"
                      style={{
                        fontSize: 'min(9px, 2.5cqmin)',
                        marginBottom: 'min(6px, 1.5cqmin)',
                      }}
                    >
                      Display as
                    </p>
                    <div
                      className="flex"
                      style={{
                        gap: 'min(6px, 1.5cqmin)',
                        marginBottom: 'min(12px, 3cqmin)',
                      }}
                    >
                      <button
                        onClick={() => setLiveScoreboardMode('name')}
                        className={`flex-1 flex items-center justify-center font-bold rounded-xl transition-all ${
                          liveScoreboardMode === 'name'
                            ? 'bg-brand-blue-primary text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        disabled={!hasNames}
                        style={{
                          gap: 'min(4px, 1cqmin)',
                          padding: 'min(8px, 2cqmin)',
                          fontSize: 'min(10px, 3cqmin)',
                        }}
                      >
                        <User
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                        />
                        Names
                      </button>
                      <button
                        onClick={() => setLiveScoreboardMode('pin')}
                        className={`flex-1 flex items-center justify-center font-bold rounded-xl transition-all ${
                          liveScoreboardMode === 'pin'
                            ? 'bg-brand-blue-primary text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        style={{
                          gap: 'min(4px, 1cqmin)',
                          padding: 'min(8px, 2cqmin)',
                          fontSize: 'min(10px, 3cqmin)',
                        }}
                      >
                        <Hash
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                        />
                        PINs
                      </button>
                    </div>
                    <p
                      className="font-bold text-slate-500 uppercase tracking-wider"
                      style={{
                        fontSize: 'min(9px, 2.5cqmin)',
                        marginBottom: 'min(6px, 1.5cqmin)',
                      }}
                    >
                      Update scores
                    </p>
                    <div
                      className="flex flex-col"
                      style={{
                        gap: 'min(4px, 1cqmin)',
                        marginBottom: 'min(14px, 3.5cqmin)',
                      }}
                    >
                      <button
                        onClick={() => setLiveScoreboardScoring('completion')}
                        className={`flex items-center font-bold rounded-xl transition-all text-left ${
                          liveScoreboardScoring === 'completion'
                            ? 'bg-brand-blue-lighter text-brand-blue-dark ring-2 ring-brand-blue-primary/30'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                        style={{
                          padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
                          fontSize: 'min(10px, 3cqmin)',
                        }}
                      >
                        On quiz completion
                      </button>
                      <button
                        onClick={() => setLiveScoreboardScoring('per-question')}
                        className={`flex items-center font-bold rounded-xl transition-all text-left ${
                          liveScoreboardScoring === 'per-question'
                            ? 'bg-brand-blue-lighter text-brand-blue-dark ring-2 ring-brand-blue-primary/30'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                        style={{
                          padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
                          fontSize: 'min(10px, 3cqmin)',
                        }}
                      >
                        After each question
                      </button>
                    </div>
                    <button
                      onClick={handleEnableLiveScoreboard}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl transition-all active:scale-95 shadow-md"
                      style={{
                        padding: 'min(10px, 2.5cqmin)',
                        fontSize: 'min(11px, 3.5cqmin)',
                      }}
                    >
                      START LIVE SCOREBOARD
                    </button>
                  </div>
                )}
              </div>

              {/* Stat boxes (non-interactive for waiting/ended) */}
              <div
                className="grid grid-cols-3"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                <StatBox
                  label="Joined"
                  value={joined + inProgress + completed}
                  icon={
                    <Users
                      style={{
                        width: 'min(14px, 4cqmin)',
                        height: 'min(14px, 4cqmin)',
                      }}
                    />
                  }
                  color="blue"
                />
                <StatBox
                  label="Active"
                  value={inProgress}
                  icon={
                    <Clock
                      style={{
                        width: 'min(14px, 4cqmin)',
                        height: 'min(14px, 4cqmin)',
                      }}
                    />
                  }
                  color="amber"
                />
                <StatBox
                  label="Finished"
                  value={completed}
                  icon={
                    <CheckCircle2
                      style={{
                        width: 'min(14px, 4cqmin)',
                        height: 'min(14px, 4cqmin)',
                      }}
                    />
                  }
                  color="green"
                />
              </div>

              {session.status === 'waiting' && (
                <div className="p-5 bg-white border-2 border-dashed border-brand-blue-primary/20 rounded-2xl text-center shadow-inner">
                  <p
                    className="text-brand-blue-primary font-black uppercase tracking-wider"
                    style={{ fontSize: 'min(14px, 4.5cqmin)' }}
                  >
                    Waiting for Students
                  </p>
                  <p
                    className="text-brand-gray-primary font-medium"
                    style={{
                      fontSize: 'min(12px, 3.5cqmin)',
                      marginTop: 'min(4px, 1cqmin)',
                    }}
                  >
                    Students appear below as they join. Press START to begin the
                    first question.
                  </p>
                </div>
              )}

              {session.status === 'ended' && (
                <div className="p-5 bg-emerald-50 text-center rounded-2xl border-2 border-emerald-100 shadow-sm">
                  <div
                    className="bg-emerald-500 text-white mx-auto rounded-full flex items-center justify-center shadow-lg"
                    style={{
                      width: 'min(32px, 8cqmin)',
                      height: 'min(32px, 8cqmin)',
                      marginBottom: 'min(12px, 3cqmin)',
                    }}
                  >
                    <CheckCircle2
                      style={{
                        width: 'min(20px, 5cqmin)',
                        height: 'min(20px, 5cqmin)',
                      }}
                    />
                  </div>
                  <p
                    className="text-emerald-800 font-black uppercase tracking-wider"
                    style={{ fontSize: 'min(16px, 5cqmin)' }}
                  >
                    Quiz Finished!
                  </p>
                  <p
                    className="text-emerald-700/70 font-bold"
                    style={{
                      fontSize: 'min(13px, 4cqmin)',
                      marginTop: 'min(4px, 1cqmin)',
                    }}
                  >
                    {completed} students crossed the finish line
                  </p>
                </div>
              )}

              {/* Student roster for waiting/ended */}
              {responses.length > 0 && (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between border-b border-brand-blue-primary/10 pb-1">
                    <button
                      onClick={() => setShowRoster(!showRoster)}
                      className="flex items-center gap-1"
                    >
                      <span
                        className="text-brand-blue-primary/60 font-black uppercase tracking-widest"
                        style={{ fontSize: 'min(10px, 3cqmin)' }}
                      >
                        Roster · {responses.length}
                      </span>
                      {showRoster ? (
                        <EyeOff
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                          className="text-brand-blue-primary/40"
                        />
                      ) : (
                        <Eye
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                          className="text-brand-blue-primary/40"
                        />
                      )}
                    </button>
                    {showRoster && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowAnswerColors(!showAnswerColors)}
                          className={`flex items-center gap-1 font-bold rounded-md transition-all ${
                            showAnswerColors
                              ? 'text-brand-blue-primary bg-brand-blue-lighter/50'
                              : 'text-brand-blue-primary/40 hover:text-brand-blue-primary/60'
                          }`}
                          style={{
                            fontSize: 'min(9px, 2.5cqmin)',
                            padding: 'min(3px, 0.7cqmin) min(6px, 1.5cqmin)',
                          }}
                          title="Color-code answers for current question"
                        >
                          <Palette
                            style={{
                              width: 'min(12px, 3cqmin)',
                              height: 'min(12px, 3cqmin)',
                            }}
                          />
                          Colors
                        </button>
                        {session.tabWarningsEnabled !== false && (
                          <button
                            onClick={() => setShowTabWarnings(!showTabWarnings)}
                            className={`flex items-center gap-1 font-bold rounded-md transition-all ${
                              showTabWarnings
                                ? 'text-red-500 bg-red-50'
                                : 'text-brand-blue-primary/40 hover:text-brand-blue-primary/60'
                            }`}
                            style={{
                              fontSize: 'min(9px, 2.5cqmin)',
                              padding: 'min(3px, 0.7cqmin) min(6px, 1.5cqmin)',
                            }}
                            title="Show/hide tab switch warnings in roster"
                          >
                            <AlertTriangle
                              style={{
                                width: 'min(12px, 3cqmin)',
                                height: 'min(12px, 3cqmin)',
                              }}
                            />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {showRoster && (
                    <div
                      className="max-h-60 overflow-y-auto pr-1 custom-scrollbar"
                      style={{
                        gap: 'min(6px, 1.5cqmin)',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {responses
                        .slice()
                        .sort((a, b) => a.pin.localeCompare(b.pin))
                        .map((r) => (
                          <StudentRow
                            key={r.studentUid}
                            response={r}
                            totalQuestions={session.totalQuestions}
                            questions={quizData.questions}
                            currentQuestion={currentQ}
                            showAnswerColors={showAnswerColors}
                            showTabWarnings={
                              showTabWarnings &&
                              session.tabWarningsEnabled !== false
                            }
                            confirmRemove={confirmRemove === r.studentUid}
                            onConfirmRemoveToggle={() =>
                              setConfirmRemove(
                                confirmRemove === r.studentUid
                                  ? null
                                  : r.studentUid
                              )
                            }
                            onRemove={
                              onRemoveStudent
                                ? () => {
                                    void Promise.resolve(
                                      onRemoveStudent(r.studentUid)
                                    )
                                      .then(() => setConfirmRemove(null))
                                      .catch(() => undefined);
                                  }
                                : undefined
                            }
                            pinToName={pinToName}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Primary Advance Control */}
      {(session.status === 'waiting' ||
        (session.status === 'active' && session.sessionMode !== 'student')) && (
        <div
          className="border-t border-brand-blue-primary/10"
          style={{ padding: 'min(16px, 4cqmin)' }}
        >
          <button
            onClick={() => void handleAdvance()}
            disabled={advancing}
            className="w-full bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-brand-gray-lighter text-white font-black rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-95 group/adv"
            style={{
              padding: 'min(14px, 3.5cqmin)',
              gap: 'min(10px, 2.5cqmin)',
              fontSize: 'min(15px, 5cqmin)',
            }}
          >
            {advancing ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(20px, 5cqmin)',
                  height: 'min(20px, 5cqmin)',
                }}
              />
            ) : (
              <>
                {session.status === 'waiting'
                  ? 'START QUIZ SESSION'
                  : isReviewing
                    ? session.currentQuestionIndex + 1 >= session.totalQuestions
                      ? 'COMPLETE & VIEW RESULTS'
                      : 'NEXT QUESTION'
                    : session.currentQuestionIndex + 1 >= session.totalQuestions
                      ? 'COMPLETE & VIEW RESULTS'
                      : session.showPodiumBetweenQuestions
                        ? 'SHOW RESULTS'
                        : 'NEXT QUESTION'}
                <ChevronRight
                  className="group-hover/adv:translate-x-1 transition-transform"
                  style={{
                    width: 'min(20px, 5cqmin)',
                    height: 'min(20px, 5cqmin)',
                  }}
                />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

const StatBox: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'amber' | 'green';
}> = ({ label, value, icon, color }) => {
  const themes = {
    blue: 'bg-brand-blue-lighter border-brand-blue-primary/10 text-brand-blue-primary',
    amber: 'bg-amber-50 border-amber-200 text-amber-600',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-600',
  };

  return (
    <div
      className={`${themes[color]} rounded-2xl text-center border shadow-sm`}
      style={{ padding: 'min(10px, 2.5cqmin)' }}
    >
      <div
        className="opacity-60"
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 'min(4px, 1cqmin)',
        }}
      >
        {icon}
      </div>
      <p
        className="font-black leading-none"
        style={{ fontSize: 'min(20px, 6.5cqmin)' }}
      >
        {value}
      </p>
      <p
        className="font-bold uppercase tracking-tighter opacity-70"
        style={{
          fontSize: 'min(10px, 3.5cqmin)',
          marginTop: 'min(2px, 0.5cqmin)',
        }}
      >
        {label}
      </p>
    </div>
  );
};

const InteractiveStatBox: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'amber' | 'green';
  expanded: boolean;
  onToggle: () => void;
  students: { pin: string; name: string }[];
}> = ({ label, value, icon, color, expanded, onToggle, students }) => {
  const themes = {
    blue: 'bg-brand-blue-lighter border-brand-blue-primary/10 text-brand-blue-primary',
    amber: 'bg-amber-50 border-amber-200 text-amber-600',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-600',
  };
  const expandedBorder = {
    blue: 'border-brand-blue-primary/30',
    amber: 'border-amber-300',
    green: 'border-emerald-300',
  };

  return (
    <div className="flex flex-col">
      <button
        onClick={onToggle}
        className={`${themes[color]} rounded-xl text-center border shadow-sm transition-all active:scale-95 cursor-pointer ${
          expanded ? `ring-2 ring-offset-1 ${expandedBorder[color]}` : ''
        }`}
        style={{ padding: 'min(6px, 1.5cqmin) min(4px, 1cqmin)' }}
      >
        <div
          className="opacity-60"
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 'min(2px, 0.5cqmin)',
          }}
        >
          {icon}
        </div>
        <p
          className="font-black leading-none"
          style={{ fontSize: 'min(18px, 5.5cqmin)' }}
        >
          {value}
        </p>
        <p
          className="font-bold uppercase tracking-tighter opacity-70"
          style={{
            fontSize: 'min(9px, 3cqmin)',
            marginTop: 'min(1px, 0.3cqmin)',
          }}
        >
          {label}
        </p>
      </button>
      {expanded && students.length > 0 && (
        <div
          className={`${themes[color]} rounded-lg border mt-1 overflow-y-auto`}
          style={{
            maxHeight: 'min(100px, 25cqmin)',
            padding: 'min(4px, 1cqmin)',
          }}
        >
          {students.map((s) => (
            <p
              key={s.pin}
              className="truncate font-bold"
              style={{
                fontSize: 'min(10px, 2.8cqmin)',
                padding: 'min(2px, 0.5cqmin) min(4px, 1cqmin)',
              }}
            >
              {s.name}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

const StudentRow: React.FC<{
  response: QuizResponse;
  totalQuestions: number;
  questions: QuizQuestion[];
  currentQuestion?: QuizQuestion;
  showAnswerColors: boolean;
  showTabWarnings: boolean;
  confirmRemove: boolean;
  onConfirmRemoveToggle: () => void;
  onRemove?: () => void;
  pinToName: Record<string, string>;
}> = ({
  response,
  totalQuestions,
  questions,
  currentQuestion,
  showAnswerColors,
  showTabWarnings,
  confirmRemove,
  onConfirmRemoveToggle,
  onRemove,
  pinToName,
}) => {
  const warnings = response.tabSwitchWarnings ?? 0;

  const correctCount = response.answers.filter((a) => {
    const q = questions.find((qn) => qn.id === a.questionId);
    return q ? gradeAnswer(q, a.answer) : false;
  }).length;

  // Answer color for current question
  let answerColorDot = 'bg-brand-gray-light'; // not answered yet
  if (showAnswerColors && currentQuestion) {
    const ans = response.answers.find(
      (a) => a.questionId === currentQuestion.id
    );
    if (ans) {
      answerColorDot = gradeAnswer(currentQuestion, ans.answer)
        ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
        : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]';
    } else {
      answerColorDot = 'bg-amber-400';
    }
  } else {
    // Status-based coloring
    const statusDots = {
      completed: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]',
      'in-progress': 'bg-amber-500',
      joined: 'bg-brand-gray-light',
    };
    answerColorDot = statusDots[response.status];
  }

  const statusBg = {
    completed: 'bg-emerald-50 border-emerald-100',
    'in-progress': 'bg-amber-50/50 border-amber-100',
    joined: 'bg-white border-brand-blue-primary/5',
  };
  const statusText = {
    completed: 'text-emerald-700 font-black',
    'in-progress': 'text-amber-700 font-bold',
    joined: 'text-brand-gray-primary font-medium',
  };

  const displayName = pinToName[response.pin]
    ? pinToName[response.pin]
    : `PIN ${response.pin}`;

  if (confirmRemove) {
    return (
      <div
        className="flex items-center rounded-xl border bg-red-50 border-red-200"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: 'min(8px, 2cqmin)',
        }}
      >
        <span
          className="flex-1 text-red-700 font-bold"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          Remove {displayName}?
        </span>
        <button
          onClick={onRemove}
          className="bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-colors"
          style={{
            padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
            fontSize: 'min(10px, 3cqmin)',
          }}
        >
          Yes
        </button>
        <button
          onClick={onConfirmRemoveToggle}
          className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors"
          style={{
            padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
            fontSize: 'min(10px, 3cqmin)',
          }}
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center rounded-xl border transition-all group/row ${statusBg[response.status]}`}
      style={{
        gap: 'min(8px, 2cqmin)',
        padding: 'min(8px, 2cqmin)',
      }}
    >
      <div
        className={`rounded-full shrink-0 ${answerColorDot}`}
        style={{ width: 'min(8px, 2cqmin)', height: 'min(8px, 2cqmin)' }}
      />
      <span
        className="flex-1 flex items-center gap-1.5 text-brand-blue-dark font-bold truncate"
        style={{ fontSize: 'min(12px, 3.5cqmin)' }}
      >
        <span className={pinToName[response.pin] ? '' : 'font-mono'}>
          {displayName}
        </span>

        {showTabWarnings && warnings > 0 && (
          <span
            className="flex items-center gap-0.5 bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase font-black shrink-0"
            style={{ fontSize: 'min(9px, 2.5cqmin)' }}
            title={`${warnings} Tab Switch Warning(s)`}
          >
            <AlertTriangle
              style={{
                width: 'min(12px, 3cqmin)',
                height: 'min(12px, 3cqmin)',
              }}
            />
            {warnings}
          </span>
        )}
      </span>
      <span
        className={`px-1.5 py-0.5 rounded-md bg-white/60 border border-white/80 ${statusText[response.status]}`}
        style={{ fontSize: 'min(11px, 3cqmin)' }}
      >
        {response.status === 'completed'
          ? `${Math.round((correctCount / Math.max(totalQuestions, 1)) * 100)}%`
          : `${response.answers.length}/${totalQuestions}`}
      </span>
      {/* Remove button */}
      {onRemove && (
        <button
          onClick={onConfirmRemoveToggle}
          className="opacity-0 group-hover/row:opacity-100 text-red-400 hover:text-red-600 transition-all shrink-0"
          style={{
            width: 'min(16px, 4cqmin)',
            height: 'min(16px, 4cqmin)',
          }}
          title="Remove student"
        >
          <X
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
            }}
          />
        </button>
      )}
    </div>
  );
};

const PodiumView: React.FC<{
  responses: QuizResponse[];
  questions: QuizQuestion[];
  session: QuizSession;
  pinToName: Record<string, string>;
  onDismiss: () => void;
}> = ({ responses, questions, session, pinToName, onDismiss }) => {
  // Use shared scoring utility for consistency with scoreboard
  const suffix = getScoreSuffix(session);
  const scored = responses
    .map((r) => {
      const score = getDisplayScore(r, questions, session);
      const name = pinToName[r.pin] ?? `PIN ${r.pin}`;
      return { name, score, pin: r.pin };
    })
    .sort((a, b) => b.score - a.score);

  const top3 = scored.slice(0, 3);
  const podiumColors = ['text-amber-400', 'text-slate-400', 'text-orange-600'];
  const podiumLabels = ['1st', '2nd', '3rd'];

  return (
    <div
      className="bg-white border border-amber-200 rounded-2xl shadow-md text-center animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ padding: 'min(16px, 4cqmin)' }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 'min(12px, 3cqmin)' }}
      >
        <div className="flex items-center gap-2">
          <Trophy
            className="text-amber-500"
            style={{
              width: 'min(18px, 5cqmin)',
              height: 'min(18px, 5cqmin)',
            }}
          />
          <span
            className="font-black text-brand-blue-dark uppercase tracking-wider"
            style={{ fontSize: 'min(12px, 4cqmin)' }}
          >
            Leaderboard
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
      </div>
      <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
        {top3.map((entry, i) => (
          <div
            key={entry.pin}
            className="flex items-center bg-slate-50 border border-slate-100 rounded-xl"
            style={{
              gap: 'min(10px, 2.5cqmin)',
              padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
            }}
          >
            <Medal
              className={podiumColors[i]}
              style={{
                width: 'min(20px, 5cqmin)',
                height: 'min(20px, 5cqmin)',
              }}
            />
            <span
              className="font-black text-brand-blue-dark"
              style={{ fontSize: 'min(11px, 3.5cqmin)' }}
            >
              {podiumLabels[i]}
            </span>
            <span
              className="flex-1 text-left font-bold text-brand-blue-dark truncate"
              style={{ fontSize: 'min(12px, 4cqmin)' }}
            >
              {entry.name}
            </span>
            <span
              className="font-black text-emerald-600"
              style={{ fontSize: 'min(13px, 4.5cqmin)' }}
            >
              {entry.score}
              {suffix}
            </span>
          </div>
        ))}
        {scored.length === 0 && (
          <p
            className="text-slate-400 font-medium"
            style={{ fontSize: 'min(11px, 3.5cqmin)' }}
          >
            No scores yet
          </p>
        )}
      </div>
    </div>
  );
};

const MCDistribution: React.FC<{
  question: QuizQuestion;
  responses: QuizResponse[];
}> = ({ question, responses }) => {
  const options = [
    question.correctAnswer,
    ...question.incorrectAnswers.filter(Boolean),
  ];

  // ⚡ Bolt: Optimize O(N*M) array filtering inside the render loop
  // Instead of scanning all responses for every option, we pre-calculate
  // the distribution in a single pass O(M) and lookup by option O(1).
  const { totalAnswered, distribution } = React.useMemo(() => {
    let answered = 0;
    const dist: Record<string, number> = {};

    responses.forEach((r) => {
      const ans = r.answers.find((a) => a.questionId === question.id);
      if (ans) {
        answered++;
        dist[ans.answer] = (dist[ans.answer] || 0) + 1;
      }
    });

    return { totalAnswered: answered, distribution: dist };
  }, [responses, question.id]);

  return (
    <div className="flex flex-col" style={{ gap: 'min(8px, 2cqmin)' }}>
      <p
        className="font-bold text-brand-blue-primary/60 uppercase tracking-widest"
        style={{ fontSize: 'min(9px, 2.5cqmin)' }}
      >
        Live Answer Distribution
      </p>
      {options.map((opt) => {
        const count = distribution[opt] || 0;
        const pct =
          totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
        const isCorrect = gradeAnswer(question, opt);

        return (
          <div key={opt}>
            <div
              className="flex items-center justify-between font-bold"
              style={{
                marginBottom: 'min(4px, 1cqmin)',
                fontSize: 'min(11px, 3.5cqmin)',
              }}
            >
              <span
                className={
                  isCorrect ? 'text-emerald-700' : 'text-brand-blue-dark'
                }
                style={{ maxWidth: '80%' }}
              >
                {opt} {isCorrect && '✓'}
              </span>
              <span
                className={
                  isCorrect ? 'text-emerald-600' : 'text-brand-gray-primary'
                }
              >
                {count}
              </span>
            </div>
            <div className="h-2 bg-brand-blue-lighter rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-700 ${isCorrect ? 'bg-emerald-500' : 'bg-brand-blue-primary/40'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
