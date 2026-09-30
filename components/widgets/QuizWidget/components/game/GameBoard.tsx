import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pause } from 'lucide-react';
import type { QuizLeaderboardEntry } from '@/types';
import type { GameBoardStats, GameClock } from '@/utils/quizGame';
import { formatGameClock } from '@/utils/quizGame';

export interface GameBoardProps {
  clock: GameClock;
  stats: GameBoardStats;
  /** Ranked everyone; the board shows the first `rows`. */
  entries: QuizLeaderboardEntry[];
  rows: number;
  showNames: boolean;
  /** Server-clock ms, for how long a rank move stays on screen. */
  nowMs: number;
}

const MOVE_SHOWN_MS = 4_000;
// Same medal fills as Review's podium (present/PresentPodium.tsx).
const MEDALS = [
  { fill: 'bg-amber-400', label: '1st place' },
  { fill: 'bg-slate-300', label: '2nd place' },
  { fill: 'bg-orange-400', label: '3rd place' },
] as const;
const FINAL_SECONDS_MS = 10_000;

const keyOf = (e: QuizLeaderboardEntry): string =>
  e.studentUid ?? e.pin ?? e.name ?? `rank-${e.rank}`;

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

const CountUp: React.FC<{ value: number }> = ({ value }) => {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const duration = reducedMotion() ? 0 : 600;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const next = Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
};

type Moves = Record<string, { move: number; at: number }>;

/** Self-paced Review game board (plan D26): countdown, joined/active, first-try accuracy and Top-N. */
export const GameBoard: React.FC<GameBoardProps> = ({
  clock,
  stats,
  entries,
  rows,
  showNames,
  nowMs,
}) => {
  const shown = entries.slice(0, rows);
  const order = entries.map(keyOf).join('|');

  // Rank moves since the last reorder, kept briefly so the arrows are readable.
  const [track, setTrack] = useState<{ order: string; moves: Moves }>({
    order,
    moves: {},
  });
  if (track.order !== order) {
    const before = new Map(track.order.split('|').map((k, i) => [k, i]));
    const moves: Moves = {};
    for (const [key, value] of Object.entries(track.moves))
      if (nowMs - value.at < MOVE_SHOWN_MS) moves[key] = value;
    entries.forEach((entry, i) => {
      const was = before.get(keyOf(entry));
      if (was !== undefined && was !== i)
        moves[keyOf(entry)] = { move: was - i, at: nowMs };
    });
    setTrack({ order, moves });
  }

  // FLIP: slide each row from its old position to its new one.
  const listRef = useRef<HTMLOListElement | null>(null);
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const next = new Map<string, number>();
    const animate = !reducedMotion();
    list.querySelectorAll<HTMLElement>('[data-row]').forEach((el) => {
      const key = el.dataset.row ?? '';
      const top = el.offsetTop;
      next.set(key, top);
      const was = tops.current.get(key);
      if (!animate || was === undefined || was === top) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${was - top}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 500ms cubic-bezier(.2,.8,.2,1)';
        el.style.transform = '';
      });
    });
    tops.current = next;
  }, [order, rows]);

  const final =
    clock.phase === 'running' && clock.remainingMs <= FINAL_SECONDS_MS;
  const phaseLabel =
    clock.phase === 'waiting'
      ? 'Ready'
      : clock.phase === 'paused'
        ? 'Paused'
        : clock.phase === 'over'
          ? "Time's up"
          : null;
  const columns = shown.length > 20 ? 3 : shown.length > 10 ? 2 : 1;
  const perColumn = Math.max(5, Math.ceil(shown.length / columns));
  // Rows grow to fill the list height, capped by column width and a px ceiling.
  const rowFont = `min(${[64, 44, 34][columns - 1]}px, ${(
    100 /
    perColumn /
    1.95
  ).toFixed(2)}cqh, ${[7, 3.8, 2.5][columns - 1]}cqw)`;

  return (
    <div
      data-testid="game-board"
      className="h-full w-full flex flex-col text-left bg-white text-brand-gray-darkest font-sans"
      style={{ containerType: 'size' }}
    >
      <div
        className="shrink-0 flex flex-wrap items-end justify-between border-b border-brand-gray-lightest"
        style={{
          gap: 'min(24px, 4cqmin)',
          padding: 'min(20px, 3.5cqmin) min(28px, 5cqmin)',
        }}
      >
        <div className="flex flex-col min-w-0">
          <span
            className="inline-flex items-center font-semibold uppercase tracking-widest text-brand-gray-primary"
            style={{
              fontSize: 'min(16px, 3cqmin)',
              gap: 'min(6px, 1cqmin)',
              minHeight: '1.4em',
            }}
          >
            {clock.phase === 'paused' && (
              <Pause aria-hidden style={{ width: '1em', height: '1em' }} />
            )}
            {phaseLabel ?? 'Time left'}
          </span>
          <span
            data-testid="game-board-clock"
            className={`font-black tabular-nums leading-none ${
              final
                ? 'text-brand-red-primary'
                : clock.phase === 'paused' || clock.phase === 'over'
                  ? 'text-brand-gray-light'
                  : 'text-brand-gray-darkest'
            }`}
            style={{ fontSize: 'min(120px, 20cqmin, 17cqw)' }}
            role="timer"
            aria-live="off"
          >
            {formatGameClock(clock.remainingMs)}
          </span>
        </div>
        <div
          className="flex items-end shrink-0"
          style={{ gap: 'min(32px, 5cqmin, 3.5cqw)' }}
        >
          <Stat label="Active" value={String(stats.active)} />
          <Stat label="Joined" value={String(stats.joined)} />
          <div className="flex flex-col" style={{ gap: 'min(6px, 1cqmin)' }}>
            <Stat
              label="First try"
              value={stats.firstTryPct == null ? '-' : `${stats.firstTryPct}%`}
            />
            <div
              className="bg-brand-blue-lighter rounded-full overflow-hidden"
              style={{
                height: 'min(8px, 1.4cqmin)',
                width: 'min(140px, 22cqmin, 18cqw)',
              }}
              role="meter"
              aria-label="First try accuracy"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={stats.firstTryPct ?? 0}
            >
              <div
                className="h-full bg-brand-blue-primary rounded-full transition-[width] duration-500"
                style={{ width: `${stats.firstTryPct ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      <ol
        ref={listRef}
        aria-label="Leaderboard"
        className="flex-1 min-h-0 overflow-hidden grid content-start relative"
        style={{
          containerType: 'size',
          gridAutoFlow: 'column',
          gridTemplateRows: `repeat(${Math.max(1, Math.ceil(shown.length / columns))}, auto)`,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          columnGap: 'min(40px, 6cqmin)',
          padding: 'min(16px, 3cqmin) min(28px, 5cqmin)',
        }}
      >
        {shown.map((entry, i) => {
          const key = keyOf(entry);
          const moved = track.moves[key];
          const move =
            moved && nowMs - moved.at < MOVE_SHOWN_MS ? moved.move : 0;
          const medal = entry.score > 0 ? MEDALS[i] : undefined;
          return (
            <li
              key={key}
              data-row={key}
              className="grid items-center tabular-nums"
              style={{
                fontSize: rowFont,
                gridTemplateColumns: '1.6em minmax(0, 1fr) auto',
                ...(showNames
                  ? {}
                  : { width: '100%', maxWidth: '8em', justifySelf: 'center' }),
                lineHeight: 1.25,
                columnGap: '0.6em',
                padding: '0.28em 0.5em',
              }}
            >
              <span
                className={`font-black text-center rounded-md ${
                  medal
                    ? `${medal.fill} text-brand-gray-darkest`
                    : 'text-brand-gray-primary'
                }`}
                aria-label={medal?.label}
              >
                {i + 1}
              </span>
              <span
                className="flex items-baseline min-w-0"
                style={{ gap: '0.4em' }}
              >
                {showNames && (
                  <span className="font-bold truncate">
                    {entry.name ? firstName(entry.name) : ''}
                  </span>
                )}
                {move !== 0 && (
                  <span
                    className={`font-bold shrink-0 ${
                      move > 0 ? 'text-emerald-700' : 'text-brand-red-primary'
                    }`}
                    style={{ fontSize: '0.65em' }}
                    aria-label={move > 0 ? `Up ${move}` : `Down ${-move}`}
                  >
                    {move > 0 ? `▲${move}` : `▼${-move}`}
                  </span>
                )}
              </span>
              <span className="font-black text-right">
                <CountUp value={entry.score} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col items-end">
    <span
      className="font-semibold uppercase tracking-widest text-brand-gray-primary"
      style={{ fontSize: 'min(14px, 2.6cqmin)' }}
    >
      {label}
    </span>
    <span
      className="font-black tabular-nums leading-none text-brand-gray-darkest"
      style={{ fontSize: 'min(44px, 7.5cqmin, 6.5cqw)' }}
    >
      {value}
    </span>
  </div>
);
