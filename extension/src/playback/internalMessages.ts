import type { OverlayAction } from '../overlay/overlayState';
import type { FrameReport } from './frameScript';

const ACTIONS: readonly OverlayAction[] = ['next', 'back', 'exit'];

/** A frame's report, checked field by field since the frame runs beside an untrusted page. */
export function isFrameReport(msg: unknown): msg is FrameReport {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.token !== 'string' || m.token.length > 100) return false;
  if (m.type === 'wt:lost' || m.type === 'wt:acted') return true;
  return (
    m.type === 'wt:found' &&
    typeof m.weak === 'boolean' &&
    typeof m.url === 'string'
  );
}

export function isOverlayActionMessage(
  msg: unknown
): msg is { type: 'overlay/action'; action: OverlayAction } {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'overlay/action' && ACTIONS.some((a) => a === m.action);
}
