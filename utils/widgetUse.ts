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
