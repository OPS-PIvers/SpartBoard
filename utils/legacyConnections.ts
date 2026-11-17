// Turns the old per-widget nexus toggles into Connections for teachers who have Connections (docs/adr/0002).
import type {
  ConnectionAction,
  Dashboard,
  ExpectationsConfig,
  MusicConfig,
  NextUpConfig,
  QRConfig,
  RandomConfig,
  RecessGearConfig,
  SequenceConnection,
  SoundConfig,
  TimeToolConfig,
  WidgetConnection,
  WidgetData,
  WidgetType,
} from '@/types';
import { resolveSyncedTimer } from '@/components/widgets/MusicWidget/linkedTimer';

/** Widget config flag set once a widget's old toggles have become Connections. */
export const LEGACY_CONNECTIONS_MARKER = 'legacyConnectionsMigrated';
/** The old toggles already converted, so one whose partner widget arrives later still converts. */
export const LEGACY_CONNECTIONS_DONE = 'legacyConnectionsDone';

export interface LegacyConversion {
  connections: WidgetConnection[];
  /** Config patches that mark converted widgets. */
  markers: Record<string, Record<string, unknown>>;
}

const newId = () => crypto.randomUUID();

/** True once a widget's old toggles have become Connections. */
export const isLegacyMigrated = (config: object | undefined): boolean =>
  (config as Record<string, unknown> | undefined)?.[
    LEGACY_CONNECTIONS_MARKER
  ] === true;

/** Old toggles still apply without the flag, or while the widget is not migrated. */
export const usesLegacyToggles = (
  connectionsOn: boolean,
  config: object | undefined
): boolean => !connectionsOn || !isLegacyMigrated(config);

const isMarked = (w: WidgetData) => isLegacyMigrated(w.config);

// Toggles a widget already converted; null for a widget marked before the list existed, which counts as all done.
const doneToggles = (w: WidgetData): Set<string> | null => {
  if (!isMarked(w)) return new Set();
  const done = (w.config as Record<string, unknown> | undefined)?.[
    LEGACY_CONNECTIONS_DONE
  ];
  return Array.isArray(done)
    ? new Set(done.filter((d): d is string => typeof d === 'string'))
    : null;
};

const sequence = (
  steps: ConnectionAction[][],
  repeat: SequenceConnection['repeat']
): SequenceConnection => ({
  id: newId(),
  kind: 'sequence',
  steps: steps.map((actions) => ({ id: newId(), actions })),
  repeat,
});

// The Connections a board's unconverted old toggles stand for, or null when there are none.
export const convertLegacyConnections = (
  board: Dashboard
): LegacyConversion | null => {
  const widgets = board.widgets;
  const first = (type: WidgetType) => widgets.find((w) => w.type === type);
  const out: WidgetConnection[] = [];
  const marked = new Set<string>();
  const converted = new Map<string, Set<string>>();
  const markDone = (id: string, key: string) => {
    const keys = converted.get(id) ?? new Set<string>();
    keys.add(key);
    converted.set(id, keys);
  };
  const existingFollows = new Set(
    (board.connections ?? []).flatMap((c) =>
      c.kind === 'follow' ? [`${c.leaderId}>${c.followerId}`] : []
    )
  );
  const follow = (leader: WidgetData | undefined, followerId: string) => {
    if (!leader) return false;
    const key = `${leader.id}>${followerId}`;
    if (existingFollows.has(key)) return true;
    existingFollows.add(key);
    out.push({ id: newId(), kind: 'follow', leaderId: leader.id, followerId });
    return true;
  };
  const timer = first('time-tool');

  // Pickers that the first Timer triggers and that also start it back; found up front so widget order can't split the loop in two.
  const loopPartners = new Set<string>();
  const timerDone = timer ? doneToggles(timer) : null;
  // Still open on both sides: the Timer's end toggle and the picker's auto-start.
  const openPair = (picker: WidgetData | undefined, end: string) =>
    !!picker &&
    !!timerDone &&
    !timerDone.has(end) &&
    doneToggles(picker)?.has('autoStartTimer') === false;
  if (timer) {
    const tc = timer.config as TimeToolConfig;
    const random = first('random');
    const rc = random?.config as RandomConfig | undefined;
    if (
      random &&
      openPair(random, 'random') &&
      tc.timerEndTriggerRandom &&
      rc?.autoStartTimer &&
      rc.mode === 'single'
    ) {
      loopPartners.add(random.id);
    }
    const nextUp = first('nextUp');
    if (
      nextUp &&
      openPair(nextUp, 'nextUp') &&
      tc.timerEndTriggerNextUp &&
      (nextUp.config as NextUpConfig).autoStartTimer
    ) {
      loopPartners.add(nextUp.id);
    }
  }

  for (const w of widgets) {
    if (marked.has(w.id)) continue;
    const done = doneToggles(w);
    if (!done) continue;
    const open = (key: string) => !done.has(key);

    if (w.type === 'time-tool') {
      const c = w.config as TimeToolConfig;
      const ends: ConnectionAction[] = [];
      const keys: string[] = [];
      const loops = w.id === timer?.id && loopPartners.size > 0;
      const expectations = first('expectations');
      if (c.timerEndVoiceLevel != null && expectations && open('voice')) {
        ends.push({
          widgetId: expectations.id,
          action: `voice-${c.timerEndVoiceLevel}`,
        });
        keys.push('voice');
      }
      const traffic = first('traffic');
      if (c.timerEndTrafficColor != null && traffic && open('traffic')) {
        ends.push({ widgetId: traffic.id, action: c.timerEndTrafficColor });
        keys.push('traffic');
      }
      const random = first('random');
      if (c.timerEndTriggerRandom && random && open('random')) {
        ends.push({ widgetId: random.id, action: 'next' });
        keys.push('random');
      }
      const nextUp = first('nextUp');
      if (c.timerEndTriggerNextUp && nextUp && open('nextUp')) {
        ends.push({ widgetId: nextUp.id, action: 'next' });
        keys.push('nextUp');
      }
      const stations = first('stations');
      if (c.timerEndTriggerStationsRotate && stations && open('stations')) {
        ends.push({ widgetId: stations.id, action: 'rotate' });
        keys.push('stations');
      }
      if (ends.length > 0) {
        // Picker and Timer starting each other is one repeating loop, not two one-off Sequences.
        out.push(
          sequence(
            [[{ widgetId: w.id, action: 'start' }], ends],
            loops ? 'until-done' : 'once'
          )
        );
        if (loops) {
          loopPartners.forEach((id) => {
            marked.add(id);
            markDone(id, 'autoStartTimer');
          });
        }
        keys.forEach((k) => markDone(w.id, k));
      }
    }

    if (
      open('autoStartTimer') &&
      !loopPartners.has(w.id) &&
      ((w.type === 'random' &&
        (w.config as RandomConfig).autoStartTimer &&
        (w.config as RandomConfig).mode === 'single') ||
        (w.type === 'nextUp' && (w.config as NextUpConfig).autoStartTimer))
    ) {
      if (timer) {
        out.push(
          sequence(
            [
              [{ widgetId: w.id, action: 'next' }],
              [{ widgetId: timer.id, action: 'restart' }],
            ],
            'once'
          )
        );
        markDone(w.id, 'autoStartTimer');
      }
    }

    if (w.type === 'sound') {
      const c = w.config as SoundConfig;
      if (c.autoTrafficLight && open('traffic')) {
        const traffic = first('traffic');
        if (traffic && follow(w, traffic.id)) markDone(w.id, 'traffic');
      }
      if (c.syncExpectations && open('expectations')) {
        const all = widgets.filter((x) => x.type === 'expectations');
        const leader =
          all.find((x) => (x.config as ExpectationsConfig).syncSoundWidget) ??
          all[0];
        if (follow(leader, w.id)) markDone(w.id, 'expectations');
      }
    }

    if (
      w.type === 'music' &&
      (w.config as MusicConfig).syncWithTimeTool &&
      open('timer')
    ) {
      const leader = resolveSyncedTimer(
        widgets,
        (w.config as MusicConfig).linkedTimerId
      );
      if (follow(leader, w.id)) markDone(w.id, 'timer');
    }

    if (
      w.type === 'qr' &&
      (w.config as QRConfig).syncWithTextWidget &&
      open('text')
    ) {
      if (follow(first('text'), w.id)) markDone(w.id, 'text');
    }

    if (w.type === 'recessGear' && open('weather')) {
      const id = (w.config as RecessGearConfig).linkedWeatherWidgetId;
      const leader = widgets.find((x) => x.id === id && x.type === 'weather');
      if (follow(leader, w.id)) markDone(w.id, 'weather');
    }
  }

  if (converted.size === 0) return null;
  const markers: LegacyConversion['markers'] = {};
  converted.forEach((keys, id) => {
    const before = widgets.find((x) => x.id === id);
    const done = (before && doneToggles(before)) ?? new Set<string>();
    markers[id] = {
      [LEGACY_CONNECTIONS_MARKER]: true,
      [LEGACY_CONNECTIONS_DONE]: [...new Set([...done, ...keys])].sort(),
    };
  });
  return { connections: out, markers };
};
