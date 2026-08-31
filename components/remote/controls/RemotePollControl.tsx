import React, { useCallback, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  QrCode,
  Radio,
  RotateCcw,
  Square,
} from 'lucide-react';
import { WidgetData, PollConfig } from '@/types';
import { useAuth } from '@/context/useAuth';
import { buildPollJoinUrl } from '@/utils/pollCode';
import { withPollQuestions, withQuestionAt } from '@/utils/pollQuestions';
import { usePollSession } from '@/hooks/usePollSession';
import {
  startPollSession,
  stopPollSession,
} from '@/components/poll/pollSession';

interface RemotePollControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const OPTION_COLORS = [
  'bg-blue-500/20 border-blue-400/40 text-blue-300',
  'bg-purple-500/20 border-purple-400/40 text-purple-300',
  'bg-green-500/20 border-green-400/40 text-green-300',
  'bg-orange-500/20 border-orange-400/40 text-orange-300',
  'bg-pink-500/20 border-pink-400/40 text-pink-300',
];

const BAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-pink-500',
];

export const RemotePollControl: React.FC<RemotePollControlProps> = ({
  widget,
  updateWidget,
}) => {
  const { user, canAccessFeature } = useAuth();
  const config = widget.config as PollConfig;
  const canOfferAnonymousJoin = canAccessFeature('anonymous-join');

  const applyConfig = useCallback(
    (next: PollConfig) => updateWidget(widget.id, { config: next }),
    [updateWidget, widget.id]
  );

  const {
    questions,
    currentQuestionIndex,
    currentQuestion,
    isLive,
    displayOptions,
    canGoPrev,
    canGoNext,
    goToQuestion,
  } = usePollSession({
    config,
    teacherUid: user?.uid,
    onConfigChange: applyConfig,
  });

  const options = currentQuestion?.options ?? [];
  const showNavigation = questions.length > 1;

  const [showQr, setShowQr] = useState(false);
  const [showResumePopover, setShowResumePopover] = useState(false);

  const joinUrl =
    isLive && canOfferAnonymousJoin && config.joinCode
      ? buildPollJoinUrl(config.joinCode)
      : '';

  const qrUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
        joinUrl
      )}`
    : '';

  const liveTotal = displayOptions.reduce((s, o) => s + o.votes, 0);

  const adjustVote = (index: number, delta: number) => {
    applyConfig(
      withQuestionAt(config, currentQuestionIndex, {
        ...currentQuestion,
        options: options.map((opt, i) =>
          i === index
            ? { ...opt, votes: Math.max(0, (opt.votes ?? 0) + delta) }
            : opt
        ),
      })
    );
  };

  const resetVotes = () => {
    applyConfig(
      withPollQuestions(
        config,
        questions.map((q) => ({
          ...q,
          options: q.options.map((opt) => ({ ...opt, votes: 0 })),
        }))
      )
    );
  };

  const beginSession = async (mode: 'fresh' | 'resume') => {
    if (!user) return;
    setShowResumePopover(false);
    try {
      applyConfig(await startPollSession(config, user.uid, mode));
    } catch (err) {
      // On a flaky phone connection the session write can fail; surface it in
      // logs rather than silently leaving the teacher thinking voting started.
      console.error('[RemotePollControl] startPollSession failed:', err);
    }
  };

  const handleStartClick = () => {
    if (config.lastPollSessionId) {
      setShowResumePopover(true);
    } else {
      void beginSession('fresh');
    }
  };

  const handleStopClick = async () => {
    if (!user) return;
    setShowQr(false);
    try {
      applyConfig(await stopPollSession(config, user.uid));
    } catch (err) {
      console.error('[RemotePollControl] stopPollSession failed:', err);
    }
  };

  const totalVotes = options.reduce((s, o) => s + (o.votes ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Question + navigation */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
            Poll
          </div>
          {showNavigation && (
            <div className="text-white/60 text-xs font-bold tabular-nums">
              {currentQuestionIndex + 1} / {questions.length}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showNavigation && (
            <button
              onClick={() => goToQuestion(currentQuestionIndex - 1)}
              disabled={!canGoPrev}
              style={{ touchAction: 'manipulation' }}
              className="touch-manipulation shrink-0 p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60"
              aria-label="Previous question"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <p className="flex-1 text-white font-semibold text-sm leading-snug line-clamp-2">
            {currentQuestion?.question}
          </p>
          {showNavigation && (
            <button
              onClick={() => goToQuestion(currentQuestionIndex + 1)}
              disabled={!canGoNext}
              style={{ touchAction: 'manipulation' }}
              className="touch-manipulation shrink-0 p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60"
              aria-label="Next question"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Start / Stop live voting */}
      <div className="px-4 pt-3 shrink-0 flex flex-col gap-3">
        {isLive ? (
          <button
            onClick={() => void handleStopClick()}
            style={{ touchAction: 'manipulation' }}
            className="touch-manipulation flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 bg-red-500 hover:bg-red-600 text-white"
            aria-label="Stop voting"
          >
            <Square className="w-6 h-6" /> Stop Voting
          </button>
        ) : showResumePopover ? (
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-white/70 text-sm font-semibold text-center">
              Resume the previous session or start fresh?
            </p>
            <p className="text-white/50 text-xs text-center">
              Starting fresh clears the tallies and issues a new join code.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void beginSession('resume')}
                style={{ touchAction: 'manipulation' }}
                className="touch-manipulation py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all active:scale-95"
              >
                Resume previous
              </button>
              <button
                onClick={() => void beginSession('fresh')}
                style={{ touchAction: 'manipulation' }}
                className="touch-manipulation py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold transition-all active:scale-95"
              >
                Start fresh
              </button>
            </div>
            <button
              onClick={() => setShowResumePopover(false)}
              style={{ touchAction: 'manipulation' }}
              className="touch-manipulation py-2 text-white/50 hover:text-white/70 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartClick}
            disabled={options.length === 0}
            style={{ touchAction: 'manipulation' }}
            className="touch-manipulation flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 disabled:opacity-40 bg-green-500 hover:bg-green-600 text-white"
            aria-label="Start voting"
          >
            <Radio className="w-6 h-6" /> Start Voting
          </button>
        )}

        {/* Join QR toggle — gated by anonymous-join, only meaningful while live */}
        {isLive && canOfferAnonymousJoin && (
          <button
            onClick={() => setShowQr((v) => !v)}
            style={{ touchAction: 'manipulation' }}
            className={`touch-manipulation flex items-center justify-center gap-2 px-6 py-3 rounded-xl border font-bold transition-all active:scale-95 ${
              showQr
                ? 'bg-blue-500/20 border-blue-400/60 text-blue-300'
                : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
            }`}
            aria-label={showQr ? 'Hide join QR' : 'Show join QR'}
            aria-pressed={showQr}
          >
            <QrCode className="w-5 h-5" />
            {showQr ? 'Hide Join QR' : 'Show Join QR'}
          </button>
        )}

        {isLive && canOfferAnonymousJoin && showQr && (
          <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
            {joinUrl ? (
              <>
                <img
                  src={qrUrl}
                  alt="Join QR code"
                  width={220}
                  height={220}
                  className="rounded-xl bg-white p-2"
                />
                <p className="text-white/60 text-xs text-center">
                  Scan to vote, or go to {window.location.host}/poll and enter:
                </p>
                <code
                  data-testid="poll-join-url"
                  className="select-all text-center text-blue-300 text-2xl font-black font-mono tracking-[0.15em]"
                >
                  {config.joinCode}
                </code>
              </>
            ) : (
              <p className="text-white/50 text-sm text-center">
                Start voting to generate a join link.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tallies */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {options.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm italic">
            No options — configure in widget settings.
          </div>
        ) : isLive ? (
          // Live mode: read-only aggregated tallies from participant devices.
          displayOptions.map((opt, i) => {
            const pct = liveTotal > 0 ? (opt.votes / liveTotal) * 100 : 0;
            return (
              <div
                key={opt.id}
                className={`rounded-2xl border p-3 ${OPTION_COLORS[i % OPTION_COLORS.length]}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm flex-1 mr-2 truncate">
                    {opt.label}
                  </span>
                  <span
                    className="font-black text-lg tabular-nums shrink-0"
                    data-testid={`poll-remote-tally-${i}`}
                  >
                    {opt.votes}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${BAR_COLORS[i % BAR_COLORS.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          // Idle mode: manual +/- show-of-hands tally.
          options.map((opt, i) => {
            const pct =
              totalVotes > 0 ? ((opt.votes ?? 0) / totalVotes) * 100 : 0;
            return (
              <div
                key={opt.id}
                className={`rounded-2xl border p-3 ${OPTION_COLORS[i % OPTION_COLORS.length]}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm flex-1 mr-2 truncate">
                    {opt.label}
                  </span>
                  <span className="font-black text-lg tabular-nums shrink-0">
                    {opt.votes ?? 0}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 mb-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${BAR_COLORS[i % BAR_COLORS.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => adjustVote(i, -1)}
                    disabled={(opt.votes ?? 0) <= 0}
                    className="touch-manipulation flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 font-bold flex items-center justify-center transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                    aria-label={`Remove vote from ${opt.label}`}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => adjustVote(i, 1)}
                    className="touch-manipulation flex-1 py-2 rounded-xl bg-white/20 hover:bg-white/30 font-bold flex items-center justify-center transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                    aria-label={`Add vote to ${opt.label}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Reset — manual mode only */}
      {options.length > 0 && !isLive && (
        <div className="px-4 pb-3 shrink-0">
          <button
            onClick={resetVotes}
            className="touch-manipulation w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            <RotateCcw className="w-4 h-4" />
            Reset All Votes
          </button>
        </div>
      )}
    </div>
  );
};
