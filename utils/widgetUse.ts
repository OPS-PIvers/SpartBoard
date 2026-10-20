import type { WidgetData } from '@/types';

/** True when this teacher has not used the widget yet today (local day), so one stamp a day is enough. */
export function needsUseStamp(
  lastUse: WidgetData['lastUse'],
  uid: string,
  now: number
): boolean {
  if (!lastUse || lastUse.uid !== uid) return true;
  return new Date(lastUse.at).toDateString() !== new Date(now).toDateString();
}

/** The later of two copies' use stamps, so a merge never rolls back a use recorded on another device. */
export function withLaterUse(
  a: Pick<WidgetData, 'lastUse'>,
  b: Pick<WidgetData, 'lastUse'>
): Pick<WidgetData, 'lastUse'> {
  const x = a.lastUse;
  const y = b.lastUse;
  if (!x && !y) return {};
  if (!x || !y) return { lastUse: x ?? y };
  return { lastUse: y.at > x.at ? y : x };
}

/** Board copy without use stamps, for Synced shares: each teacher's stamps stay on their own board. */
export function withoutUseStamps<T extends { widgets: WidgetData[] }>(
  board: T
): T {
  if (!board.widgets.some((w) => w.lastUse)) return board;
  return {
    ...board,
    widgets: board.widgets.map((w) => {
      if (!w.lastUse) return w;
      const { lastUse: _lastUse, ...rest } = w;
      return rest;
    }),
  };
}

/** Remote widgets with this device's own use stamps kept. */
export function keepLocalUseStamps(
  remote: WidgetData[],
  local: WidgetData[]
): WidgetData[] {
  const stamps = new Map(
    local.filter((w) => w.lastUse).map((w) => [w.id, w.lastUse])
  );
  return remote.map((w) => {
    const lastUse = stamps.get(w.id);
    if (lastUse) return { ...w, lastUse };
    if (!w.lastUse) return w;
    const { lastUse: _lastUse, ...rest } = w;
    return rest;
  });
}
