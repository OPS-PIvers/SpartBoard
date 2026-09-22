import { useCallback, useState } from 'react';
import { useShareContent } from '@/hooks/useShareContent';
import type { DrawableObject, SubShareDrawingPayload } from '@/types';

export interface SubShareDrawingObjects {
  /** False everywhere but `/subs`, where the caller must use these instead. */
  active: boolean;
  objects: DrawableObject[];
  loading: boolean;
  addObject: (obj: DrawableObject) => Promise<void>;
  updateObject: (next: DrawableObject) => Promise<void>;
  removeObject: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

const EMPTY: DrawableObject[] = [];
const NO_PAGES: ReadonlyMap<string, DrawableObject[]> = new Map();

/**
 * A Drawing's strokes inside a sub share: the teacher's, bundled at share
 * time, plus whatever the sub draws on top, which stays in memory.
 *
 * The sub is a different signed-in user, so the ordinary path reads an empty
 * canvas from their own account and writes their strokes there, where they
 * outlive the share and survive Reset. Both halves are wrong for a sub.
 */
export function useSubShareDrawingObjects(
  widgetId: string,
  pageId: string | null | undefined
): SubShareDrawingObjects {
  const bundled = useShareContent<SubShareDrawingPayload>('drawing', widgetId);
  const active = bundled.status !== 'off';

  // Every page the sub has visited, because nothing here is persisted: one
  // slot would lose their strokes the moment they flipped a page and back.
  const seed = `${widgetId}::${bundled.status}`;
  const key = pageId ?? '';
  const [local, setLocal] = useState<{
    seed: string;
    pages: ReadonlyMap<string, DrawableObject[]>;
  }>({ seed: '', pages: NO_PAGES });

  let current = local;
  if (active && (local.seed !== seed || !local.pages.has(key))) {
    const page = bundled.payload?.pages.find((p) => p.pageId === pageId);
    const pages =
      local.seed === seed
        ? new Map(local.pages)
        : new Map<string, DrawableObject[]>();
    pages.set(key, page?.objects ?? EMPTY);
    current = { seed, pages };
    setLocal(current);
  }

  const apply = useCallback(
    (update: (objects: DrawableObject[]) => DrawableObject[]) => {
      setLocal((prev) => {
        const pages = new Map(prev.pages);
        pages.set(key, update(pages.get(key) ?? EMPTY));
        return { seed: prev.seed, pages };
      });
      return Promise.resolve();
    },
    [key]
  );

  const addObject = useCallback(
    (obj: DrawableObject) => apply((objects) => [...objects, obj]),
    [apply]
  );
  const updateObject = useCallback(
    (next: DrawableObject) =>
      apply((objects) => objects.map((o) => (o.id === next.id ? next : o))),
    [apply]
  );
  const removeObject = useCallback(
    (id: string) => apply((objects) => objects.filter((o) => o.id !== id)),
    [apply]
  );
  const clear = useCallback(() => apply(() => EMPTY), [apply]);

  return {
    active,
    objects: current.pages.get(key) ?? EMPTY,
    loading: bundled.status === 'loading',
    addObject,
    updateObject,
    removeObject,
    clear,
  };
}
