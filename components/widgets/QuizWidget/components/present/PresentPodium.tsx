import React, { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { QuizLeaderboardEntry } from '@/types';

interface PresentPodiumProps {
  entries: QuizLeaderboardEntry[];
  /** Standings at the previous review, for gains and rank moves. */
  previous?: QuizLeaderboardEntry[];
  showNames: boolean;
  unit: 'pts' | '%';
  limit: number;
  size: 'split' | 'final';
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

const keyOf = (e: QuizLeaderboardEntry): string =>
  e.studentUid ?? e.pin ?? e.name ?? `rank-${e.rank}`;

const MEDALS = [
  {
    block: 'bg-amber-400',
    text: 'text-brand-gray-darkest',
    label: '1st place',
  },
  {
    block: 'bg-slate-300',
    text: 'text-brand-gray-darkest',
    label: '2nd place',
  },
  {
    block: 'bg-orange-400',
    text: 'text-brand-gray-darkest',
    label: '3rd place',
  },
] as const;

// Podium order on screen: 2nd, 1st, 3rd; rises 3rd, 2nd, 1st.
const STEP_ORDER = [1, 0, 2];
const RISE_DELAY_MS = [550, 250, 0];

const SIZES = {
  split: {
    width: ['12vw', '10vw', '10vw'],
    height: ['20vh', '14vh', '10vh'],
    numeral: ['5vw', '4vw', '3.4vw'],
    name: ['2vw', '1.7vw', '1.7vw'],
    score: ['2.4vw', '2vw', '2vw'],
    gap: '1.2vw',
  },
  final: {
    width: ['20vw', '16vw', '16vw'],
    height: ['22vh', '15vh', '10vh'],
    numeral: ['8vw', '6vw', '5vw'],
    name: ['3.2vw', '2.4vw', '2.4vw'],
    score: ['3.4vw', '2.8vw', '2.8vw'],
    gap: '2vw',
  },
} as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

const CountUp: React.FC<{ from: number; to: number; delayMs: number }> = ({
  from,
  to,
  delayMs,
}) => {
  const [value, setValue] = useState(from);
  const still = from === to || prefersReducedMotion();
  useEffect(() => {
    if (still) return;
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 800));
      setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, delayMs, still]);
  return <>{still ? to : value}</>;
};

const Gain: React.FC<{ gain: number; delayMs: number; fontSize: string }> = ({
  gain,
  delayMs,
  fontSize,
}) =>
  gain > 0 ? (
    <span
      className="font-sans font-black text-emerald-700 tabular-nums animate-gain-pop motion-reduce:animate-none inline-block"
      style={{ fontSize, animationDelay: `${delayMs}ms` }}
    >
      +{gain}
    </span>
  ) : null;

const Move: React.FC<{ move: number; fontSize: string }> = ({
  move,
  fontSize,
}) =>
  move === 0 ? null : (
    <span
      className={`font-sans font-bold tabular-nums ${
        move > 0 ? 'text-emerald-700' : 'text-brand-red-primary'
      }`}
      style={{ fontSize }}
      aria-label={move > 0 ? `Up ${move}` : `Down ${-move}`}
    >
      {move > 0 ? `▲${move}` : `▼${-move}`}
    </span>
  );

/** Review's game board ranking: a rising top-3 podium and the rest as a list. */
export const PresentPodium: React.FC<PresentPodiumProps> = ({
  entries,
  previous,
  showNames,
  unit,
  limit,
  size,
}) => {
  const rows = entries.slice(0, limit);
  if (rows.length === 0) return null;
  const prevByKey = new Map(
    (previous ?? []).map((e, i) => [keyOf(e), { score: e.score, rank: i + 1 }])
  );
  const changeFor = (entry: QuizLeaderboardEntry, rank: number) => {
    const prev = previous ? prevByKey.get(keyOf(entry)) : undefined;
    return {
      from: prev?.score ?? (previous ? 0 : entry.score),
      gain: previous ? entry.score - (prev?.score ?? 0) : 0,
      move: prev ? prev.rank - rank : 0,
    };
  };
  const unitLabel = unit === 'pts' ? 'pts' : '%';
  const s = SIZES[size];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const everyone = !Number.isFinite(limit);
  const listColumns =
    size === 'split'
      ? rest.length > 8
        ? 2
        : 1
      : rest.length <= 2
        ? 1
        : everyone
          ? 3
          : 2;
  const listFont =
    size === 'final'
      ? everyone
        ? '1.4vw'
        : '2vw'
      : listColumns > 1
        ? '1.1vw'
        : '1.5vw';
  const moves = !!previous;
  const columns = [
    '1.8em',
    ...(showNames ? ['5.5em'] : []),
    ...(moves ? ['2.2em'] : []),
    '3em',
    ...(moves ? ['3.4em'] : []),
  ];

  return (
    <div className="flex flex-col items-center w-full" style={{ gap: '3vh' }}>
      <div
        className="flex items-end justify-center overflow-hidden"
        style={{ gap: s.gap }}
      >
        {STEP_ORDER.filter((i) => i < podium.length).map((i) => {
          const entry = podium[i];
          const medal = MEDALS[i];
          const { from, gain, move } = changeFor(entry, i + 1);
          const riseDelay = RISE_DELAY_MS[i];
          const name = showNames && entry.name ? firstName(entry.name) : null;
          return (
            <div
              key={keyOf(entry)}
              className="flex flex-col items-center"
              style={{ width: s.width[i] }}
            >
              <div
                className="flex flex-col items-center animate-in fade-in fill-mode-both duration-300 w-full"
                style={{
                  animationDelay: `${riseDelay + 450}ms`,
                  marginBottom: '1.2vh',
                  gap: '0.3vh',
                }}
              >
                {i === 0 && (
                  <Crown
                    aria-hidden
                    className="text-amber-500"
                    style={{ width: s.name[0], height: s.name[0] }}
                  />
                )}
                {name && (
                  <span
                    className="font-sans font-bold text-brand-gray-darkest truncate max-w-full"
                    style={{ fontSize: s.name[i] }}
                  >
                    {name}
                  </span>
                )}
                <span
                  className="inline-flex items-baseline"
                  style={{ gap: '0.6vw' }}
                >
                  <span
                    className={`font-sans font-black tabular-nums ${medal.text}`}
                    style={{ fontSize: s.score[i] }}
                  >
                    <CountUp
                      from={from}
                      to={entry.score}
                      delayMs={riseDelay + 600}
                    />
                  </span>
                  <span
                    className="font-sans text-brand-gray-primary"
                    style={{ fontSize: `calc(${s.score[i]} * 0.45)` }}
                  >
                    {unitLabel}
                  </span>
                </span>
                {previous && (
                  <span
                    className="inline-flex items-center"
                    style={{
                      gap: '0.6vw',
                      minHeight: `calc(${s.score[i]} * 0.7)`,
                    }}
                  >
                    <Move move={move} fontSize={`calc(${s.score[i]} * 0.5)`} />
                    <Gain
                      gain={gain}
                      delayMs={riseDelay + 1400}
                      fontSize={`calc(${s.score[i]} * 0.6)`}
                    />
                  </span>
                )}
              </div>
              <div
                className={`w-full rounded-t-md flex items-start justify-center animate-podium-rise motion-reduce:animate-none ${medal.block}`}
                style={{
                  height: s.height[i],
                  animationDelay: `${riseDelay}ms`,
                }}
                aria-label={medal.label}
              >
                <span
                  className="font-sans font-black text-brand-gray-darkest leading-none"
                  style={{ fontSize: s.numeral[i], marginTop: '1.5vh' }}
                  aria-hidden
                >
                  {i + 1}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <div
          className="grid text-left"
          style={{
            gridAutoFlow: 'column',
            gridTemplateRows: `repeat(${Math.ceil(rest.length / listColumns)}, auto)`,
            columnGap: size === 'final' ? '5vw' : '3vw',
            rowGap: '0.8vh',
          }}
        >
          {rest.map((entry, idx) => {
            const rank = idx + 4;
            const { from, gain, move } = changeFor(entry, rank);
            const name = showNames && entry.name ? firstName(entry.name) : null;
            return (
              <div
                key={keyOf(entry)}
                className="grid items-baseline whitespace-nowrap tabular-nums animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300"
                style={{
                  fontSize: listFont,
                  gridTemplateColumns: columns.join(' '),
                  columnGap: '0.5em',
                  animationDelay: `${900 + idx * 60}ms`,
                }}
              >
                <span className="font-sans font-black text-brand-gray-primary">
                  {rank}
                </span>
                {showNames && (
                  <span className="font-sans font-bold text-brand-gray-darkest truncate">
                    {name}
                  </span>
                )}
                {moves && (
                  <span className="text-right">
                    <Move move={move} fontSize="0.7em" />
                  </span>
                )}
                <span className="font-sans font-black text-brand-gray-darkest text-right">
                  <CountUp from={from} to={entry.score} delayMs={1200} />
                </span>
                {moves && (
                  <span>
                    <Gain gain={gain} delayMs={2000} fontSize="0.8em" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
