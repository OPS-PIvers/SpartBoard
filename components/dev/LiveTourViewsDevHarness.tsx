import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices, Clock, ListTodo, Settings2, Timer } from 'lucide-react';
import { TourSpotlight } from '@/components/tours/TourSpotlight';
import { TourTip, type TourTipStatus } from '@/components/tours/TourTip';
import { TourBar } from '@/components/tours/TourBar';
import { centreTip } from '@/components/tours/tipPlacement';
import { TourEditorPanel } from '@/components/tours/editor/TourEditorPanel';
import {
  IDLE_PLAYBACK,
  type TourEditPlayback,
} from '@/components/tours/editor/tourEditStore';
import type { TourEditorSession } from '@/components/tours/editor/useTourEditorSession';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  placeCallout,
  tetherFor,
} from '@/components/widgets/GuidedLearning/utils/calloutPlacement';

// DEV-only: the live-tour tip and bar against fake anchors, one state per ?state=.
const STATES = [
  'plain',
  'anchored',
  'drawer',
  'missing',
  'autopilot',
  'blocked',
  'confirm',
  'edit-plain',
  'edit-jumping',
  'edit-blocked',
  'edit-missing',
  'edit-flipped',
  'edit-collapsed',
] as const;
type State = (typeof STATES)[number];

const readState = (): State => {
  const q = new URLSearchParams(window.location.search).get('state');
  return (STATES as readonly string[]).includes(q ?? '')
    ? (q as State)
    : 'anchored';
};

const TARGET: Record<State, string | null> = {
  plain: null,
  anchored: 'dock-timer',
  drawer: 'drawer-sound',
  missing: null,
  autopilot: 'dock-timer',
  blocked: 'widget-start',
  confirm: 'drawer-sound',
  'edit-plain': null,
  'edit-jumping': null,
  'edit-blocked': 'widget-start',
  'edit-missing': null,
  'edit-flipped': 'right-start',
  'edit-collapsed': 'dock-timer',
};

const STEP: Record<State, { title: string; text: string; n: number }> = {
  plain: {
    title: 'Timers on your board',
    text: 'In this tour you will add a timer, set it, and start it.',
    n: 1,
  },
  anchored: {
    title: 'Open the Timer',
    text: 'Click **Timer** in the dock to add one to your board.',
    n: 2,
  },
  drawer: {
    title: 'Turn on the alarm',
    text: 'Switch on **Play a sound** so the class hears when time is up.',
    n: 4,
  },
  missing: {
    title: 'Pick a preset',
    text: '',
    n: 3,
  },
  autopilot: {
    title: 'Open the Timer',
    text: 'Click **Timer** in the dock to add one to your board.',
    n: 2,
  },
  blocked: {
    title: 'Start the timer',
    text: 'Press **Start** when the class is ready.',
    n: 5,
  },
  confirm: {
    title: 'Turn on the alarm',
    text: 'Switch on **Play a sound** so the class hears when time is up.',
    n: 4,
  },
  'edit-plain': {
    title: 'Timers on your board',
    text: 'In this tour you will add a timer, set it, and start it.',
    n: 1,
  },
  'edit-jumping': {
    title: 'Turn on the alarm',
    text: 'Switch on **Play a sound** so the class hears when time is up.',
    n: 4,
  },
  'edit-blocked': {
    title: 'Start the timer',
    text: 'Press **Start** when the class is ready.',
    n: 5,
  },
  'edit-missing': {
    title: 'Pick a preset',
    text: '',
    n: 3,
  },
  'edit-flipped': {
    title: 'Start the stopwatch',
    text: 'Press **Start** on the stopwatch.',
    n: 6,
  },
  'edit-collapsed': {
    title: 'Open the Timer',
    text: 'Click **Timer** in the dock to add one to your board.',
    n: 2,
  },
};

// The editor outline's fake tour: one step per harness state above.
const EDIT_STEPS: GuidedLearningStep[] = [
  {
    id: 'e1',
    label: 'Timers on your board',
    text: 'In this tour you will add a timer, set it, and start it.',
    tour: { anchor: 'board.whole', action: 'observe' },
  },
  {
    id: 'e2',
    label: 'Open the Timer',
    text: 'Click **Timer** in the dock to add one to your board.',
    tour: { anchor: 'dock.item:time-tool', action: 'click' },
  },
  {
    id: 'e3',
    label: 'Pick a preset',
    tour: { anchor: 'widget.settings-opener', action: 'click' },
  },
  {
    id: 'e4',
    label: 'Turn on the alarm',
    text: 'Switch on **Play a sound** so the class hears when time is up.',
    tour: {
      anchor: 'settings.field:time-tool#sound',
      action: 'toggle',
      value: true,
    },
  },
  {
    id: 'e5',
    label: 'Start the timer',
    text: 'Press **Start** when the class is ready.',
    tour: { anchor: 'widget.window', action: 'click', teacherMustClick: true },
  },
  {
    id: 'e6',
    label: '',
    tour: { anchor: 'widget.toolbar', action: 'click' },
  },
].map(
  (st) =>
    ({
      xPct: 50,
      yPct: 50,
      imageIndex: 0,
      interactionType: 'text-popover',
      ...st,
    }) as GuidedLearningStep
);

const EDIT_PLAYBACK: Partial<Record<State, Partial<TourEditPlayback>>> = {
  'edit-jumping': { jumping: true, anchor: 'searching' },
  'edit-blocked': { blocked: true, anchor: 'found' },
  'edit-missing': { anchor: 'missing', missing: ['e3'] },
  'edit-flipped': { anchor: 'found' },
};

const useFakeSession = (selected: number): TourEditorSession => {
  const [set, setSet] = useState<GuidedLearningSet>(
    () =>
      ({
        id: 'harness',
        title: 'Timer basics',
        mode: 'tour',
        imageUrls: [],
        steps: EDIT_STEPS,
      }) as unknown as GuidedLearningSet
  );
  const [sel, setSel] = useState(selected);
  const [prevSelected, setPrevSelected] = useState(selected);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setSel(selected);
  }
  const editStep = (
    id: string,
    change: (s: GuidedLearningStep) => GuidedLearningStep
  ) =>
    setSet((cur) => ({
      ...cur,
      steps: cur.steps.map((st) => (st.id === id ? change(st) : st)),
    }));
  return {
    set,
    selected: sel,
    select: setSel,
    updateStep: (id, patch) => editStep(id, (st) => ({ ...st, ...patch })),
    setBinding: (id, tour) => editStep(id, (st) => ({ ...st, tour })),
    insertStepAfter: () => EDIT_STEPS[0],
    deleteStep: (id) =>
      setSet((cur) => ({
        ...cur,
        steps: cur.steps.filter((st) => st.id !== id),
      })),
    moveStep: (id, to) =>
      setSet((cur) => {
        const steps = cur.steps.filter((st) => st.id !== id);
        const moved = cur.steps.find((st) => st.id === id);
        if (moved) steps.splice(to, 0, moved);
        return { ...cur, steps };
      }),
    updateSet: (patch) => setSet((cur) => ({ ...cur, ...patch })),
    undo: () => undefined,
    redo: () => undefined,
    canUndo: true,
    canRedo: false,
    saveState: 'saved',
    flush: () => Promise.resolve(true),
  };
};

const TOTAL = 6;
const GUTTER = 16;

const boldText = (text: string) =>
  text
    .split(/(\*\*[^*]+\*\*)/)
    .map((part, i) =>
      part.startsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );

const obstaclesOnPage = () =>
  Array.from(document.querySelectorAll('[data-tour-obstacle]'))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));

const FakeBoard: React.FC<{ drawer: boolean; stopwatch?: boolean }> = ({
  drawer,
  stopwatch,
}) => (
  <div className="absolute inset-0 bg-slate-600">
    <div className="absolute left-[8%] top-[22%] w-72 rounded-2xl border border-white/20 bg-white/10 p-4 text-white shadow-xl backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ListTodo className="h-4 w-4" aria-hidden="true" /> To-Do
      </div>
      {['Warm-up', 'Read chapter 4', 'Exit ticket'].map((item) => (
        <div key={item} className="py-1 text-sm text-slate-100">
          {item}
        </div>
      ))}
    </div>
    <div className="absolute left-[42%] top-[30%] w-80 rounded-2xl border border-white/20 bg-white/10 text-white shadow-xl backdrop-blur-xl">
      {drawer ? (
        <div className="flex h-72 flex-col">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-sm font-semibold">
            <Settings2 className="h-4 w-4" aria-hidden="true" /> Timer settings
          </div>
          <div className="flex-1 space-y-3 overflow-hidden px-4 py-3 text-sm">
            {['Count up', 'Show presets', 'Big digits'].map((row) => (
              <div key={row} className="flex justify-between text-slate-100">
                {row}
                <span className="h-4 w-7 rounded-full bg-white/25" />
              </div>
            ))}
            <div
              data-fake-anchor="drawer-sound"
              className="flex justify-between rounded-lg text-slate-100"
            >
              Play a sound
              <span className="h-4 w-7 rounded-full bg-white/25" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 p-5">
          <Timer className="h-5 w-5 text-slate-200" aria-hidden="true" />
          <div className="text-5xl font-bold tabular-nums">05:00</div>
          <button
            type="button"
            data-fake-anchor="widget-start"
            className="rounded-lg bg-white/15 px-4 py-1.5 text-sm font-semibold"
          >
            Start
          </button>
        </div>
      )}
    </div>
    {stopwatch && (
      <div className="absolute right-[3%] top-[14%] flex w-56 flex-col items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-5 text-white shadow-xl backdrop-blur-xl">
        <div className="text-4xl font-bold tabular-nums">00:00</div>
        <button
          type="button"
          data-fake-anchor="right-start"
          className="rounded-lg bg-white/15 px-4 py-1.5 text-sm font-semibold"
        >
          Start
        </button>
      </div>
    )}
    <div
      data-tour-obstacle=""
      className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-2xl border border-white/20 bg-slate-900/60 p-2 backdrop-blur-xl"
    >
      {[
        { id: 'dock-clock', icon: Clock, label: 'Clock' },
        { id: 'dock-timer', icon: Timer, label: 'Timer' },
        { id: 'dock-dice', icon: Dices, label: 'Dice' },
      ].map(({ id, icon: Icon, label }) => (
        <div
          key={id}
          data-fake-anchor={id}
          className="flex w-14 flex-col items-center gap-1 rounded-xl py-1.5 text-white"
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
          <span className="text-xxs">{label}</span>
        </div>
      ))}
    </div>
  </div>
);

export const LiveTourViewsDevHarness: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<State>(readState);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [box, setBox] = useState({ w: 320, h: 140 });
  const [, setTick] = useState(0);
  const onPlace = useCallback(() => setTick((n) => n + 1), []);
  const [autoOn, setAutoOn] = useState(
    () => readState() === 'autopilot' || readState() === 'blocked'
  );
  const [readAloud, setReadAloud] = useState(false);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLDivElement | null>(null);

  const targetId = TARGET[state];
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = targetId
        ? document.querySelector(`[data-fake-anchor="${targetId}"]`)
        : null;
      setRect(el ? el.getBoundingClientRect() : null);
    });
    return () => cancelAnimationFrame(raf);
  }, [targetId]);
  const observer = useRef<ResizeObserver | null>(null);
  const measureTip = useCallback((el: HTMLDivElement | null) => {
    tipRef.current = el;
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox((prev) =>
        prev.w === r.width && prev.h === r.height
          ? prev
          : { w: r.width, h: r.height }
      );
    });
    observer.current.observe(el);
  }, []);

  const pick = (next: State) => {
    setState(next);
    setAutoOn(next === 'autopilot' || next === 'blocked');
    const url = new URL(window.location.href);
    url.searchParams.set('state', next);
    window.history.replaceState(null, '', url);
  };

  const step = STEP[state];
  const isEdit = state.startsWith('edit-');
  const session = useFakeSession(step.n - 1);
  const view = { w: window.innerWidth, h: window.innerHeight };
  const obstacles = obstaclesOnPage();
  const target = rect
    ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
    : null;
  const placement = target
    ? placeCallout({ box, target, container: view, obstacles })
    : null;
  const tether =
    placement && target
      ? tetherFor(
          { x: placement.left, y: placement.top, w: placement.width, h: box.h },
          target
        )
      : null;
  const plainTip = state === 'plain' || state === 'edit-plain';
  const width = plainTip
    ? 400
    : state === 'missing' || state === 'edit-missing'
      ? 360
      : 320;
  const centred = centreTip({ w: width, h: box.h }, view, obstacles, GUTTER);

  const status: TourTipStatus | null =
    state === 'autopilot'
      ? {
          text: t('tours.autoPlaying'),
          kind: 'playing',
          testId: 'tour-auto-status',
        }
      : state === 'blocked' || state === 'edit-blocked'
        ? {
            text: t(isEdit ? 'tours.editor.youClick' : 'tours.autoSkipped'),
            kind: 'turn',
            testId: 'tour-auto-status',
          }
        : null;
  const playback: TourEditPlayback = {
    ...IDLE_PLAYBACK,
    index: step.n - 1,
    anchor: target ? 'found' : 'idle',
    rect: target,
    ...EDIT_PLAYBACK[state],
  };

  return (
    <div className="fixed inset-0 overflow-hidden font-sans">
      <FakeBoard
        drawer={
          state === 'drawer' || state === 'confirm' || state === 'edit-jumping'
        }
        stopwatch={state === 'edit-flipped'}
      />
      <label className="absolute bottom-4 left-4 z-[20000] flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-xs text-slate-700 shadow">
        State
        <select
          value={state}
          onChange={(e) => pick(e.target.value as State)}
          className="rounded border border-slate-300 px-1 py-0.5"
        >
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {(!!rect || plainTip) && state !== 'edit-jumping' && (
        <TourSpotlight rect={rect} pulse={state === 'drawer'} />
      )}
      {isEdit && (
        <TourEditorPanel
          key={state}
          session={session}
          playback={playback}
          readAloud={{ on: readAloud, onToggle: () => setReadAloud((v) => !v) }}
          onClose={() => undefined}
          initialCollapsed={state === 'edit-collapsed'}
          initialSide="right"
        />
      )}
      {!isEdit && (
        <TourBar
          current={step.n}
          total={TOTAL}
          onBack={step.n > 1 ? () => undefined : undefined}
          onNext={() => undefined}
          onRetry={state === 'missing' ? () => undefined : undefined}
          autopilot={{ on: autoOn, onChange: setAutoOn }}
          readAloud={{ on: readAloud, onToggle: () => setReadAloud((v) => !v) }}
          onExit={() => undefined}
          onPlace={onPlace}
        />
      )}
      {state !== 'edit-jumping' && (
        <TourTip
          key={state}
          boxRef={measureTip}
          headingRef={headingRef}
          left={placement ? placement.left : centred.left}
          top={placement ? placement.top : centred.top}
          width={placement ? placement.width : width}
          tether={tether}
          plain={!target}
          animate
          title={step.title}
          looking={false}
          status={status}
          onShowMe={
            state === 'anchored' || state === 'drawer'
              ? () => undefined
              : undefined
          }
          autopilotStep={
            state === 'anchored' || state === 'drawer'
              ? { onRun: () => undefined }
              : undefined
          }
          confirm={
            state === 'confirm'
              ? { onYes: () => undefined, onNo: () => undefined }
              : undefined
          }
        >
          {state === 'missing' || state === 'edit-missing' ? (
            <p className="text-sm text-slate-200">{t('tours.anchorMissing')}</p>
          ) : (
            step.text && (
              <p className="text-sm text-slate-100">{boldText(step.text)}</p>
            )
          )}
        </TourTip>
      )}
    </div>
  );
};
