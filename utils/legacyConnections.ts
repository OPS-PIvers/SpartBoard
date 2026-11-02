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

export interface LegacyConversion {
  connections: WidgetConnection[];
  /** Config patches that mark converted widgets. */
  markers: Record<string, Record<string, unknown>>;
}

const newId = () => crypto.randomUUID();

const isMarked = (w: WidgetData) =>
  (w.config as Record<string, unknown>)[LEGACY_CONNECTIONS_MARKER] === true;

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
  if (timer && !isMarked(timer)) {
    const tc = timer.config as TimeToolConfig;
    const random = first('random');
    const rc = random?.config as RandomConfig | undefined;
    if (
      random &&
      !isMarked(random) &&
      tc.timerEndTriggerRandom &&
      rc?.autoStartTimer &&
      rc.mode === 'single'
    ) {
      loopPartners.add(random.id);
    }
    const nextUp = first('nextUp');
    if (
      nextUp &&
      !isMarked(nextUp) &&
      tc.timerEndTriggerNextUp &&
      (nextUp.config as NextUpConfig).autoStartTimer
    ) {
      loopPartners.add(nextUp.id);
    }
  }

  for (const w of widgets) {
    if (isMarked(w) || marked.has(w.id)) continue;
    let converted = false;

    if (w.type === 'time-tool') {
      const c = w.config as TimeToolConfig;
      const ends: ConnectionAction[] = [];
      const loops = w.id === timer?.id && loopPartners.size > 0;
      const expectations = first('expectations');
      if (c.timerEndVoiceLevel != null && expectations) {
        ends.push({
          widgetId: expectations.id,
          action: `voice-${c.timerEndVoiceLevel}`,
        });
      }
      const traffic = first('traffic');
      if (c.timerEndTrafficColor != null && traffic) {
        ends.push({ widgetId: traffic.id, action: c.timerEndTrafficColor });
      }
      const random = first('random');
      if (c.timerEndTriggerRandom && random) {
        ends.push({ widgetId: random.id, action: 'next' });
      }
      const nextUp = first('nextUp');
      if (c.timerEndTriggerNextUp && nextUp) {
        ends.push({ widgetId: nextUp.id, action: 'next' });
      }
      const stations = first('stations');
      if (c.timerEndTriggerStationsRotate && stations) {
        ends.push({ widgetId: stations.id, action: 'rotate' });
      }
      if (ends.length > 0) {
        // Picker and Timer starting each other is one repeating loop, not two one-off Sequences.
        out.push(
          sequence(
            [[{ widgetId: w.id, action: 'start' }], ends],
            loops ? 'until-done' : 'once'
          )
        );
        if (loops) loopPartners.forEach((id) => marked.add(id));
        converted = true;
      }
    }

    if (
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
        converted = true;
      }
    }

    if (w.type === 'sound') {
      const c = w.config as SoundConfig;
      if (c.autoTrafficLight) {
        const traffic = first('traffic');
        if (traffic && follow(w, traffic.id)) converted = true;
      }
      if (c.syncExpectations) {
        const all = widgets.filter((x) => x.type === 'expectations');
        const leader =
          all.find((x) => (x.config as ExpectationsConfig).syncSoundWidget) ??
          all[0];
        if (follow(leader, w.id)) converted = true;
      }
    }

    if (w.type === 'music' && (w.config as MusicConfig).syncWithTimeTool) {
      const leader = resolveSyncedTimer(
        widgets,
        (w.config as MusicConfig).linkedTimerId
      );
      if (follow(leader, w.id)) converted = true;
    }

    if (w.type === 'qr' && (w.config as QRConfig).syncWithTextWidget) {
      if (follow(first('text'), w.id)) converted = true;
    }

    if (w.type === 'recessGear') {
      const id = (w.config as RecessGearConfig).linkedWeatherWidgetId;
      const leader = widgets.find((x) => x.id === id && x.type === 'weather');
      if (follow(leader, w.id)) converted = true;
    }

    if (converted) marked.add(w.id);
  }

  if (marked.size === 0) return null;
  const markers: LegacyConversion['markers'] = {};
  marked.forEach((id) => {
    markers[id] = { [LEGACY_CONNECTIONS_MARKER]: true };
  });
  return { connections: out, markers };
};
