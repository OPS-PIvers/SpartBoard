// The worker's half of the Tours tab and badge (docs/plans/WEB_TOURS_HELP_PANEL.md H5, H6).
import type { ApiResult } from './spartboardApi';
import {
  badgeFor,
  parseTourList,
  type TourListCache,
  type TourListReply,
} from './tourList';

export interface TourListDeps {
  list(interactive: boolean): Promise<ApiResult<unknown>>;
  load(): Promise<TourListCache | undefined>;
  save(list: TourListCache | null): Promise<void>;
  tabs(): Promise<{ id?: number; url?: string }[]>;
  setBadge(tabId: number, text: string): Promise<void>;
  now(): number;
}

export function createTourListWorker(deps: TourListDeps) {
  const badgeTabs = async (tours: TourListCache['tours']) => {
    for (const tab of await deps.tabs().catch(() => [])) {
      if (tab.id !== undefined)
        await deps.setBadge(tab.id, badgeFor(tours, tab.url)).catch(() => {});
    }
  };

  return {
    /** Fetches the list, caches it and redraws every tab's badge; a refusal clears the cache, so no badge outlives access, while offline answers with the cache. */
    async refresh(interactive = false): Promise<TourListReply> {
      const got = await deps.list(interactive);
      if (!got.ok) {
        if (got.why === 'offline') {
          const cached = await deps.load().catch(() => undefined);
          return cached ? { ok: true, list: cached } : got;
        }
        await deps.save(null);
        await badgeTabs([]);
        return got;
      }
      const list = parseTourList(got.value, deps.now());
      await deps.save(list);
      await badgeTabs(list.tours);
      return { ok: true, list };
    },

    /** Redraws one tab's badge from the cached list after it navigates. */
    async badge(tabId: number, url: string | undefined) {
      const list = await deps.load().catch(() => undefined);
      await deps
        .setBadge(tabId, badgeFor(list?.tours ?? [], url))
        .catch(() => {});
    },
  };
}
