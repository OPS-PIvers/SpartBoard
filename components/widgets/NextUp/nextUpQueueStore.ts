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
      // Nothing changed: wait for the write already queued instead of repeating it.
      if (next === queue) return lastWrite;
      version++;
      set(next);
      pendingWrites++;
      const done = chain.then(() => write(next));
      lastWrite = done;
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
      if (startedIdle && pendingWrites === 0 && version === startVersion) {
        set(loaded);
      }
    },
    clear: () => {
      joinedIds.clear();
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
