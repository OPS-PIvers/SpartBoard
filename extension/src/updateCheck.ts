// Update now (docs/plans/WEB_TOURS_CROSS_SITE.md X15): ask Chrome for a newer version and reload into it.
import type { ExtensionUpdateStatus } from '@/components/tours/web/extensionProtocol';

export interface UpdateCheckDeps {
  requestUpdateCheck: () => Promise<{ status: string }>;
  reload: () => void;
  /** Runs `fn` after the reply has gone out, so the page hears back before the worker stops. */
  later: (fn: () => void) => void;
}

export function createUpdateCheck(deps: UpdateCheckDeps) {
  return async (): Promise<ExtensionUpdateStatus> => {
    let status: string;
    try {
      ({ status } = await deps.requestUpdateCheck());
    } catch {
      return 'throttled';
    }
    if (status === 'update_available') {
      deps.later(deps.reload);
      return 'available';
    }
    return status === 'no_update' ? 'none' : 'throttled';
  };
}
