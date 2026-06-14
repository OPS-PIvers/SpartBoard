import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Minus, QrCode, Radio, RotateCcw, Square } from 'lucide-react';
import { WidgetData, PollConfig, PollOption } from '@/types';
import { useAuth } from '@/context/useAuth';
import { db } from '@/config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { buildPublicPollLink } from '@/components/poll/pollLink';
import {
  aggregateVotes,
  makePollSessionId,
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
  // Memoised so the array identity is stable across renders — it feeds the
  // joinUrl useMemo + the votes-subscription effect deps below.
  const options: PollOption[] = useMemo(
    () => config.options ?? [],
    [config.options]
  );
  const canOfferAnonymousJoin = canAccessFeature('anonymous-join');

  const activePollSessionId = config.activePollSessionId ?? null;
  const isLive = !!activePollSessionId;

  const [showQr, setShowQr] = useState(false);
  const [showResumePopover, setShowResumePopover] = useState(false);
  const [sessionTally, setSessionTally] = useState<number[]>([]);

  // Subscribe to the live votes subcollection while a session is active.
  // `options.length` is in the deps, so the effect re-subscribes (with a fresh
  // closure) if the teacher edits the option count mid-session — no stale count.
  useEffect(() => {
    if (!activePollSessionId || !user) return;
    const sessionId = makePollSessionId(user.uid, activePollSessionId);
    const unsub = onSnapshot(
      collection(db, 'poll_sessions', sessionId, 'votes'),
      (snap) => {
        const votes = snap.docs.map((d) => d.data() as { optionIndex: number });
        setSessionTally(aggregateVotes(votes, options.length));
      }
    );
    return () => {
      unsub();
      // Clear on teardown so a stopped session's tally doesn't flash on the
      // board when a fresh session starts before its first snapshot arrives.
      setSessionTally([]);
    };
  }, [activePollSessionId, user, options.length]);

  const joinUrl = useMemo(() => {
    if (!isLive || !user || !canOfferAnonymousJoin || !activePollSessionId) {
      return '';
    }
    return buildPublicPollLink({
      id: activePollSessionId,
      question: config.question ?? 'Vote Now!',
      options: options.map((o) => ({ id: o.id, label: o.label })),
      teacherUid: user.uid,
    });
  }, [
    isLive,
    user,
    canOfferAnonymousJoin,
    activePollSessionId,
    config.question,
    options,
  ]);

  const qrUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
        joinUrl
      )}`
    : '';

  const liveOptions = options.map((o, i) => ({
    ...o,
    votes: sessionTally[i] ?? 0,
  }));
  const liveTotal = liveOptions.reduce((s, o) => s + o.votes, 0);

  const adjustVote = (index: number, delta: number) => {
    const updated = options.map((opt, i) =>
      i === index
        ? { ...opt, votes: Math.max(0, (opt.votes ?? 0) + delta) }
        : opt
    );
    updateWidget(widget.id, { config: { ...config, options: updated } });
  };

  const resetVotes = () => {
    const updated = options.map((opt) => ({ ...opt, votes: 0 }));
    updateWidget(widget.id, { config: { ...config, options: updated } });
  };

  const beginSession = async (mode: 'fresh' | 'resume') => {
    if (!user) return;
    setShowResumePopover(false);
    try {
      const next = await startPollSession(config, user.uid, mode);
      updateWidget(widget.id, { config: next });
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
      const next = await stopPollSession(config, user.uid);
      updateWidget(widget.id, { config: next });
    } catch (err) {
      console.error('[RemotePollControl] stopPollSession failed:', err);
    }
  };

  const totalVotes = options.reduce((s, o) => s + (o.votes ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Question */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <div className="text-white/60 text-xs uppercase tracking-widest font-bold mb-1">
          Poll
        </div>
        {config.question && (
          <p className="text-white font-semibold text-sm leading-snug line-clamp-2">
            {config.question}
          </p>
        )}
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
              className="touch-manipulation py-2 text-white/40 hover:text-white/70 text-xs font-semibold"
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
                <p className="text-white/50 text-xs text-center">
                  Scan to vote, or open this link:
                </p>
                <code
                  data-testid="poll-join-url"
                  className="select-all break-all text-center text-blue-300 text-xs font-mono px-2"
                >
                  {joinUrl}
                </code>
              </>
            ) : (
              <p className="text-white/40 text-sm text-center">
                Start voting to generate a join link.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tallies */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {options.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/30 text-sm italic">
            No options — configure in widget settings.
          </div>
        ) : isLive ? (
          // Live mode: read-only aggregated tallies from participant devices.
          liveOptions.map((opt, i) => {
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
