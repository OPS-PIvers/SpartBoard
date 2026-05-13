/**
 * SubBoardScreen — Phase A mockup of the sub-viewing-a-board screen.
 *
 * Visual demonstration only. The Phase 1+ real version will:
 *   - Pull the share doc's `initialState: WidgetData[]` from Firestore
 *   - Render via the existing WidgetRenderer + read-only DraggableWindow
 *   - Hold a SubDashboardContext working copy for local interactions
 *
 * Here we hand-render placeholder widget tiles in a fixed 4x3 grid so the
 * UX of "no dock, no chrome, frozen-but-clickable" is clear.
 */

import React, { useMemo, useState } from 'react';
import { Play, RotateCcw, Shuffle, Volume2, X } from 'lucide-react';
import { SubProfileToolbar } from './SubProfileToolbar';
import { getMockBoardWidgets } from './subsMockData';
import type { MockSharedBoard, MockWidget } from './subsMockData';

interface SubBoardScreenProps {
  board: MockSharedBoard;
  onBackToDirectory: () => void;
  onChangeBuilding: () => void;
}

export const SubBoardScreen: React.FC<SubBoardScreenProps> = ({
  board,
  onBackToDirectory,
  onChangeBuilding,
}) => {
  // The `resetKey` is the entire mechanism for "Reset board" in the mockup:
  // bumping it re-mounts the widget tiles so any local interactive state
  // (timer running, lunch counts, shuffle order) is thrown away. Phase 1
  // will replace this with a context-driven deep-clone from initialState.
  const [resetKey, setResetKey] = useState(0);
  const widgets = useMemo(() => getMockBoardWidgets(), []);

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 20% 0%, #1d2a5d 0%, transparent 50%),' +
          'radial-gradient(circle at 80% 100%, #2d3f89 0%, transparent 50%),' +
          'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      }}
    >
      <SubProfileToolbar
        teacherName={board.teacherName}
        teacherInitials={board.teacherInitials}
        accentColor={board.accentColor}
        boardName={board.boardName}
        expiresAt={board.expiresAt}
        onReset={() => setResetKey((k) => k + 1)}
        onBackToDirectory={onBackToDirectory}
        onChangeBuilding={onChangeBuilding}
      />

      {/* Read-only banner — calm, glanceable, never overwhelming */}
      <div className="fixed top-4 right-4 z-40 hidden md:flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 px-3 py-1.5 text-[11px] text-white/80">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Substitute view — widgets are locked in place
      </div>

      <main className="pt-24 px-6 pb-10">
        <div
          key={resetKey}
          className="mx-auto max-w-7xl grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gridAutoRows: 'minmax(180px, auto)',
          }}
        >
          {widgets.map((w) => (
            <FrozenWidgetTile key={w.id} widget={w} />
          ))}
        </div>
      </main>
    </div>
  );
};

const FrozenWidgetTile: React.FC<{ widget: MockWidget }> = ({ widget }) => {
  const Icon = widget.icon;
  return (
    <div
      className="relative rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 shadow-xl shadow-black/20 overflow-hidden flex flex-col"
      style={{
        gridColumn: `${widget.col} / span ${widget.colSpan}`,
        gridRow: `${widget.row} / span ${widget.rowSpan}`,
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 text-white/60 shrink-0" />
          <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider truncate">
            {widget.title}
          </span>
        </div>
        <span
          className="text-[9px] text-white/30 uppercase tracking-wider"
          title="Widgets are locked in place — but you can still interact with their content"
        >
          Locked
        </span>
      </div>
      <div className="flex-1 p-4 flex items-center justify-center">
        <WidgetPreview kind={widget.preview} />
      </div>
    </div>
  );
};

const WidgetPreview: React.FC<{ kind: MockWidget['preview'] }> = ({ kind }) => {
  switch (kind) {
    case 'clock':
      return <ClockPreview />;
    case 'schedule':
      return <SchedulePreview />;
    case 'lunch':
      return <LunchPreview />;
    case 'timer':
      return <TimerPreview />;
    case 'randomizer':
      return <RandomizerPreview />;
    case 'noise':
      return <NoisePreview />;
    case 'attention':
      return <AttentionPreview />;
    case 'notes':
      return <NotesPreview />;
    case 'scoreboard':
      return <ScoreboardPreview />;
    case 'music':
      return <MusicPreview />;
    default:
      return null;
  }
};

// ──────────────── Mock widget previews ────────────────
// Hand-styled to feel like the real widgets without depending on them.

const ClockPreview: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="text-center">
      <div className="text-4xl font-mono font-bold text-white tabular-nums">
        {now.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-white/50">
        {now.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })}
      </div>
    </div>
  );
};

const SchedulePreview: React.FC = () => {
  const items = [
    { time: '8:15', label: 'Morning meeting', active: false },
    { time: '8:30', label: 'Reading block', active: true },
    { time: '9:45', label: 'Math', active: false },
    { time: '11:10', label: 'Lunch', active: false },
  ];
  return (
    <ul className="w-full space-y-1.5">
      {items.map((it) => (
        <li
          key={it.label}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
            it.active
              ? 'bg-brand-blue-primary/50 text-white border border-brand-blue-light'
              : 'text-white/70'
          }`}
        >
          <span className="font-mono text-[10px] text-white/60 w-10 shrink-0">
            {it.time}
          </span>
          <span className="truncate">{it.label}</span>
        </li>
      ))}
    </ul>
  );
};

const LunchPreview: React.FC = () => {
  const [counts, setCounts] = useState({ hot: 8, cold: 4, home: 3 });
  return (
    <div className="w-full space-y-1.5 text-[11px]">
      {(['hot', 'cold', 'home'] as const).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="capitalize w-12 text-white/70">{k}</span>
          <button
            onClick={() =>
              setCounts((c) => ({ ...c, [k]: Math.max(0, c[k] - 1) }))
            }
            className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 text-white/80 cursor-pointer"
          >
            −
          </button>
          <span className="font-mono font-bold text-white w-6 text-center">
            {counts[k]}
          </span>
          <button
            onClick={() => setCounts((c) => ({ ...c, [k]: c[k] + 1 }))}
            className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 text-white/80 cursor-pointer"
          >
            +
          </button>
        </div>
      ))}
    </div>
  );
};

const TimerPreview: React.FC = () => {
  const [remaining, setRemaining] = useState(15 * 60);
  const [running, setRunning] = useState(false);
  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);
  React.useEffect(() => {
    if (remaining === 0 && running) setRunning(false);
  }, [remaining, running]);
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return (
    <div className="text-center">
      <div className="text-4xl font-mono font-bold text-white tabular-nums">
        {mm}:{ss}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          onClick={() => setRunning((r) => !r)}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/80 hover:bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 cursor-pointer"
        >
          <Play className="w-3 h-3" />
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={() => {
            setRunning(false);
            setRemaining(15 * 60);
          }}
          className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-[10px] font-bold px-3 py-1 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>
    </div>
  );
};

const RandomizerPreview: React.FC = () => {
  const names = ['Ava', 'Marcus', 'Priya', 'Diego', 'Mei', 'Noah', 'Zoe'];
  const [picked, setPicked] = useState(() => names[0]);
  return (
    <div className="text-center w-full">
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
        Next up
      </div>
      <div className="text-2xl font-bold text-white">{picked}</div>
      <button
        onClick={() => {
          const next = names[Math.floor(Math.random() * names.length)];
          setPicked(next);
        }}
        className="mt-3 inline-flex items-center gap-1 rounded-full bg-violet-500/80 hover:bg-violet-500 text-white text-[10px] font-bold px-3 py-1 cursor-pointer"
      >
        <Shuffle className="w-3 h-3" />
        Shuffle
      </button>
    </div>
  );
};

const NoisePreview: React.FC = () => (
  <div className="w-full">
    <div className="flex items-center gap-2 text-white/80 mb-2">
      <Volume2 className="w-4 h-4" />
      <span className="text-[11px] font-bold">Noise level</span>
    </div>
    <div className="space-y-1">
      {[80, 55, 30].map((p) => (
        <div key={p} className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-amber-400"
            style={{ width: `${p}%` }}
          />
        </div>
      ))}
    </div>
    <div className="mt-2 text-[10px] text-white/50">Quiet hum</div>
  </div>
);

const AttentionPreview: React.FC = () => (
  <div className="text-center">
    <div className="text-3xl">✋</div>
    <div className="mt-1 text-[10px] uppercase tracking-wider text-white/60">
      Eyes up
    </div>
    <div className="mt-2 text-[10px] text-white/40">Tap to chime</div>
  </div>
);

const NotesPreview: React.FC = () => (
  <div className="w-full text-[11px] text-white/80 leading-snug">
    <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1.5">
      Notes from Ms. Johnson
    </div>
    <ul className="space-y-1 list-disc list-inside">
      <li>
        Reading workshop runs 8:30—9:30. Books are in bin labeled
        &ldquo;Today.&rdquo;
      </li>
      <li>Marcus has a 9am pull-out for speech.</li>
      <li>If fire drill, exit door 3 — line up by class number.</li>
    </ul>
  </div>
);

const ScoreboardPreview: React.FC = () => {
  const [score, setScore] = useState({ a: 12, b: 9 });
  return (
    <div className="w-full text-center">
      <div className="grid grid-cols-2 gap-2">
        {(['a', 'b'] as const).map((t) => (
          <div key={t} className="rounded-lg bg-white/5 p-2">
            <div className="text-[10px] uppercase tracking-wider text-white/50">
              Team {t.toUpperCase()}
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {score[t]}
            </div>
            <div className="mt-1 flex justify-center gap-1">
              <button
                onClick={() =>
                  setScore((s) => ({ ...s, [t]: Math.max(0, s[t] - 1) }))
                }
                className="w-5 h-5 text-[10px] rounded bg-white/10 hover:bg-white/20 text-white/80 cursor-pointer"
              >
                −
              </button>
              <button
                onClick={() => setScore((s) => ({ ...s, [t]: s[t] + 1 }))}
                className="w-5 h-5 text-[10px] rounded bg-white/10 hover:bg-white/20 text-white/80 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MusicPreview: React.FC = () => {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="w-full text-center">
      <div className="text-xs font-bold text-white truncate">
        Quiet Focus Mix
      </div>
      <div className="text-[10px] text-white/50">Lo-fi · Instrumental</div>
      <button
        onClick={() => setPlaying((p) => !p)}
        className={`mt-3 w-10 h-10 rounded-full flex items-center justify-center mx-auto transition-colors cursor-pointer ${
          playing
            ? 'bg-rose-500/80 hover:bg-rose-500 text-white'
            : 'bg-emerald-500/80 hover:bg-emerald-500 text-white'
        }`}
      >
        {playing ? <X className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
    </div>
  );
};
