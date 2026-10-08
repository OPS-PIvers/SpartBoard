import { useSyncExternalStore } from 'react';
import type { TourMaterialContent, TourMaterialKind } from '@/types';

/** Why an item is in the sandbox: made or loaded by the tour, or a copy of a real item it edited. */
export type SandboxOrigin = 'created' | 'sample' | 'copy';

export interface SandboxItem extends TourMaterialContent {
  origin: SandboxOrigin;
  /** Bumped on every write, so lists re-sort newest first. */
  seq: number;
}

type Shelf = ReadonlyMap<string, SandboxItem>;

export interface TourSandboxState {
  active: boolean;
  items: Readonly<Record<TourMaterialKind, Shelf>>;
  /** Real items the tour deleted; lists hide them until the sandbox ends. */
  removed: Readonly<Record<TourMaterialKind, ReadonlySet<string>>>;
  /** Real items a teacher picked for the tour; their writes are real. */
  passthrough: ReadonlySet<string>;
  /** Tour material id to the library item it is on this run. */
  bound: ReadonlyMap<string, { kind: TourMaterialKind; id: string }>;
}

export const TOUR_MATERIAL_KINDS: readonly TourMaterialKind[] = [
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
  'activity-wall',
];

const empty = (): TourSandboxState => ({
  active: false,
  items: {
    quiz: new Map(),
    'video-activity': new Map(),
    'guided-learning': new Map(),
    'mini-app': new Map(),
    'activity-wall': new Map(),
  },
  removed: {
    quiz: new Set(),
    'video-activity': new Set(),
    'guided-learning': new Set(),
    'mini-app': new Set(),
    'activity-wall': new Set(),
  },
  passthrough: new Set(),
  bound: new Map(),
});

let state = empty();
let seq = 0;
const listeners = new Set<() => void>();
const emit = (next: TourSandboxState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getTourSandbox = (): TourSandboxState => state;

export const useTourSandbox = (): TourSandboxState =>
  useSyncExternalStore(subscribe, getTourSandbox, getTourSandbox);

/** Starts an empty sandbox; library writes stay in memory until it ends. */
export const startTourSandbox = (): void => emit({ ...empty(), active: true });

/** Drops everything the sandbox held; nothing it held was ever written. */
export const endTourSandbox = (): void => {
  if (state.active) emit(empty());
};

export const isTourSandboxActive = (): boolean => state.active;

const SANDBOX_PREFIX = 'tour-sandbox-';

export const sandboxId = (): string =>
  `${SANDBOX_PREFIX}${crypto.randomUUID()}`;

export const isSandboxId = (id: unknown): boolean =>
  typeof id === 'string' && id.startsWith(SANDBOX_PREFIX);

/** A join code shaped like a real one, for faked assignments. */
export const fakeJoinCode = (): string =>
  Array.from(
    { length: 6 },
    () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
  ).join('');

/** Whether writes to this item stay in memory. */
export const isSandboxed = (id?: string | null): boolean =>
  state.active && !(id && state.passthrough.has(id));

export const sandboxGet = (
  kind: TourMaterialKind,
  id: string
): SandboxItem | undefined => state.items[kind].get(id);

/** Finds an item by a field of its library entry, like a Drive file id. */
export const sandboxFind = (
  kind: TourMaterialKind,
  match: (meta: Record<string, unknown>) => boolean
): [string, SandboxItem] | undefined =>
  [...state.items[kind]].find(([, item]) => match(item.meta));

export const sandboxPut = (
  kind: TourMaterialKind,
  id: string,
  content: TourMaterialContent,
  origin: SandboxOrigin = 'created'
): void => {
  if (!state.active) return;
  const shelf = new Map(state.items[kind]);
  shelf.set(id, {
    ...content,
    origin: shelf.get(id)?.origin ?? origin,
    seq: ++seq,
  });
  emit({ ...state, items: { ...state.items, [kind]: shelf } });
};

/** Removes a sandbox item, or hides a real one for the rest of the tour. */
export const sandboxRemove = (kind: TourMaterialKind, id: string): void => {
  if (!state.active) return;
  const shelf = new Map(state.items[kind]);
  const wasCopy = shelf.get(id)?.origin === 'copy';
  const existed = shelf.delete(id);
  const removed =
    !existed || wasCopy
      ? { ...state.removed, [kind]: new Set(state.removed[kind]).add(id) }
      : state.removed;
  emit({ ...state, items: { ...state.items, [kind]: shelf }, removed });
};

/** Real items whose writes go through, for materials the teacher picked. */
export const setSandboxPassthrough = (ids: readonly string[]): void => {
  if (state.active) emit({ ...state, passthrough: new Set(ids) });
};

export const bindTourMaterial = (
  materialId: string,
  kind: TourMaterialKind,
  id: string
): void => {
  if (!state.active) return;
  emit({ ...state, bound: new Map(state.bound).set(materialId, { kind, id }) });
};

export const tourMaterialItem = (
  materialId: string
): { kind: TourMaterialKind; id: string } | undefined =>
  state.bound.get(materialId);

/** The library list as the tour sees it: its own items first, deleted ones gone. */
export function mergeSandboxList<T extends { id: string }>(
  real: readonly T[],
  kind: TourMaterialKind,
  sandbox: TourSandboxState
): T[] {
  if (!sandbox.active) return real as T[];
  const shelf = sandbox.items[kind];
  const removed = sandbox.removed[kind];
  if (shelf.size === 0 && removed.size === 0) return real as T[];
  const own = [...shelf.values()]
    .filter((item) => item.origin !== 'copy')
    .sort((a, b) => b.seq - a.seq)
    .map((item) => item.meta as unknown as T);
  const rest = real
    .filter((r) => !removed.has(r.id))
    .map((r) => {
      const copy = shelf.get(r.id);
      return copy ? (copy.meta as unknown as T) : r;
    });
  return [...own, ...rest];
}

/** Items a teacher can keep when the tour ends: what it made, or the sample it worked on. */
export const keepableSandboxItems = (): {
  kind: TourMaterialKind;
  id: string;
  title: string;
}[] =>
  TOUR_MATERIAL_KINDS.flatMap((kind) =>
    [...state.items[kind]]
      .filter(([, item]) => item.origin !== 'copy')
      .map(([id, item]) => ({
        kind,
        id,
        title: typeof item.meta.title === 'string' ? item.meta.title : '',
      }))
  );

type Keeper = (content: TourMaterialContent) => Promise<void>;
const keepers = new Map<TourMaterialKind, Keeper[]>();

/** A mounted widget's real save, used when a teacher keeps a tour's item. */
export const registerSandboxKeeper = (
  kind: TourMaterialKind,
  keeper: Keeper
): (() => void) => {
  keepers.set(kind, [...(keepers.get(kind) ?? []), keeper]);
  return () =>
    keepers.set(
      kind,
      (keepers.get(kind) ?? []).filter((k) => k !== keeper)
    );
};

/** Saves a sandbox item to the teacher's real library; false when no widget can save that kind. */
export const keepSandboxItem = async (
  kind: TourMaterialKind,
  id: string
): Promise<boolean> => {
  const item = state.items[kind].get(id);
  const keeper = keepers.get(kind)?.at(-1);
  if (!item || !keeper) return false;
  await keeper({ meta: item.meta, data: item.data });
  return true;
};

/** Wraps a hook's API so calls on sandbox ids do nothing while the sandbox is on. */
export function sandboxApi<T extends object>(api: T, overrides: Partial<T>): T {
  if (!state.active) return api;
  const out = { ...api } as Record<string, unknown>;
  for (const [key, value] of Object.entries(api)) {
    if (typeof value !== 'function') continue;
    const fn = value as (...args: unknown[]) => unknown;
    out[key] = (...args: unknown[]) =>
      args.some(isSandboxId) ? Promise.resolve(undefined) : fn(...args);
  }
  return { ...(out as T), ...overrides };
}
