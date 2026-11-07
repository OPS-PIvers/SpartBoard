import type { NextUpQueueItem } from '@/types';
import { nextUpQueueReducer, type NextUpQueueAction } from './nextUpQueueUtils';

type WriteQueue = (queue: NextUpQueueItem[]) => Promise<void>;

/** One widget's queue: changes apply to the latest queue, Drive writes run in order. */
export interface NextUpQueueStore {
  getQueue: () => NextUpQueueItem[];
  subscribe: (listener: () => void) => () => void;
  /** Applies the change now; resolves once Drive holds it (rejects if that write fails). */
  dispatch: (action: NextUpQueueAction, write: WriteQueue) => Promise<void>;
  /** Shows a downloaded queue unless a local change happened while it loaded. */
  load: (download: () => Promise<NextUpQueueItem[]>) => Promise<void>;
  /** Drops the queue without writing, when the session ends. */
  clear: () => void;
}

export function createNextUpQueueStore(): NextUpQueueStore {
  let queue: NextUpQueueItem[] = [];
  let version = 0;
  let pendingWrites = 0;
  let chain: Promise<void> = Promise.resolve();
  let lastWrite: Promise<void> = Promise.resolve();
  let lastWriteFailed = false;
  // Joins this tab took in that Drive doesn't hold yet; a download must not drop them.
  let unsavedJoins = false;
  // A join already taken in stays out after a Reset, even if its entry doc is still being deleted.
  const joinedIds = new Set<string>();
  const listeners = new Set<() => void>();

  const set = (next: NextUpQueueItem[]) => {
    if (next === queue) return;
    queue = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getQueue: () => queue,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (rawAction, write) => {
      let action = rawAction;
      if (action.type === 'joined') {
        const entries = action.entries.filter((e) => !joinedIds.has(e.id));
        entries.forEach((e) => joinedIds.add(e.id));
        action = { type: 'joined', entries };
      }
      const next = nextUpQueueReducer(queue, action);
      // Nothing changed: wait for the write already queued, unless it failed and Drive is behind.
      if (next === queue && !lastWriteFailed) return lastWrite;
      if (next !== queue) {
        version++;
        set(next);
      }
      pendingWrites++;
      const isJoin = action.type === 'joined';
      const done = chain.then(() => write(next));
      lastWrite = done;
      done.then(
        () => {
          if (lastWrite !== done) return;
          lastWriteFailed = false;
          unsavedJoins = false;
        },
        () => {
          if (lastWrite !== done) return;
          lastWriteFailed = true;
          if (isJoin) unsavedJoins = true;
        }
      );
      chain = done
        .catch(() => undefined)
        .finally(() => {
          pendingWrites--;
        });
      return done;
    },
    load: async (download) => {
      const startVersion = version;
      const startedIdle = pendingWrites === 0;
      const loaded = await download();
      // Drive wins over a failed Next or Reset, as before, but not over joins only this tab holds.
      if (
        startedIdle &&
        pendingWrites === 0 &&
        version === startVersion &&
        !unsavedJoins
      ) {
        lastWriteFailed = false;
        set(loaded);
      }
    },
    clear: () => {
      joinedIds.clear();
      lastWriteFailed = false;
      unsavedJoins = false;
      version++;
      set([]);
    },
  };
}

const stores = new Map<string, NextUpQueueStore>();

/** The board widget and its settings share one store per widget id. */
export function getNextUpQueueStore(widgetId: string): NextUpQueueStore {
  let store = stores.get(widgetId);
  if (!store) {
    store = createNextUpQueueStore();
    stores.set(widgetId, store);
  }
  return store;
}
