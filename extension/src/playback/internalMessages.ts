import type { OverlayAction } from '../overlay/overlayState';
import type { FrameReport } from './frameScript';
import { parseWebTourLocator } from '@/components/tours/web/extensionProtocol';

const ACTIONS: readonly OverlayAction[] = ['next', 'back', 'exit', 'start'];

/** A frame's clues for a fix: a valid locator without frames, which the step keeps. */
const isFix = (v: unknown): boolean =>
  !!v &&
  typeof v === 'object' &&
  !('frames' in v) &&
  parseWebTourLocator(v) !== null;

/** A frame's report, checked field by field since the frame runs beside an untrusted page. */
export function isFrameReport(msg: unknown): msg is FrameReport {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.token !== 'string' || m.token.length > 100) return false;
  if (
    m.type === 'wt:lost' ||
    m.type === 'wt:acted' ||
    m.type === 'wt:ambiguous'
  )
    return true;
  if (m.type === 'wt:candidate') return isFix(m.fix);
  return (
    m.type === 'wt:found' &&
    typeof m.weak === 'boolean' &&
    typeof m.url === 'string' &&
    (m.fix === undefined || isFix(m.fix))
  );
}

export function isOverlayActionMessage(
  msg: unknown
): msg is { type: 'overlay/action'; action: OverlayAction } {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'overlay/action' && ACTIONS.some((a) => a === m.action);
}
