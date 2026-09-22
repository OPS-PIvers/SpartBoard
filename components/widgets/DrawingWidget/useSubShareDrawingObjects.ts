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

  const seedKey = `${widgetId}::${pageId ?? ''}::${bundled.status}`;
  const [local, setLocal] = useState<{
    key: string;
    objects: DrawableObject[];
  }>({ key: '', objects: EMPTY });

  let current = local;
  if (active && local.key !== seedKey) {
    const page = bundled.payload?.pages.find((p) => p.pageId === pageId);
    current = { key: seedKey, objects: page?.objects ?? EMPTY };
    setLocal(current);
  }

  const apply = useCallback(
    (update: (objects: DrawableObject[]) => DrawableObject[]) => {
      setLocal((prev) => ({ key: prev.key, objects: update(prev.objects) }));
      return Promise.resolve();
    },
    []
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
    objects: current.objects,
    loading: bundled.status === 'loading',
    addObject,
    updateObject,
    removeObject,
    clear,
  };
}
