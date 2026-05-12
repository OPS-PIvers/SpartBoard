/**
 * Cross-layer signal for fire-and-forget PLC sync writes that fail.
 *
 * The PLC helpers (`writePlcAssignmentTemplate`,
 * `writePlcAssignmentIndexEntry`, `mirrorPlcAssignmentStatus`) are called
 * from data-layer hooks that intentionally don't `await` — the canonical
 * assignment commit must not block on PLC sync. The helpers log+swallow
 * so an unhandled rejection doesn't escape, but until now nothing told
 * the user their share didn't land.
 *
 * The data layer dispatches a `spartboard:plc-write-failed` CustomEvent;
 * a UI-layer listener (mounted high in the teacher app — see
 * `DashboardView`) surfaces a toast. This keeps the helpers free of UI
 * dependencies and gives us a single seam for future routing (e.g. open
 * a retry dialog from the toast action).
 */

export type PlcWriteFailureScope =
  | 'assignmentTemplate'
  | 'assignmentIndex'
  | 'assignmentStatusMirror';

export interface PlcWriteFailureDetail {
  scope: PlcWriteFailureScope;
  plcId: string;
}

export const PLC_WRITE_FAILED_EVENT = 'spartboard:plc-write-failed';

/**
 * Dispatch a UI-layer notification that a fire-and-forget PLC write
 * failed. No-op outside a browser environment (SSR, vitest jsdom-less
 * paths). The caller is still responsible for `logError(...)`.
 */
export function notifyPlcWriteFailure(detail: PlcWriteFailureDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PlcWriteFailureDetail>(PLC_WRITE_FAILED_EVENT, { detail })
  );
}
