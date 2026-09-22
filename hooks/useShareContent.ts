import { useContext, useEffect, useState } from 'react';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import type { SubShareContentKind } from '@/types';

export type ShareContentStatus = 'off' | 'loading' | 'ready' | 'missing';

export interface ShareContentState<T> {
  /** 'off' means this is not a sub share — read your own data as usual. */
  status: ShareContentStatus;
  payload: T | null;
}

const OFF = { status: 'off', payload: null } as const;

/**
 * Whether this board is being viewed inside a sub share at all, which the
 * bundled-content hook cannot answer for a widget that points at nothing yet:
 * without it an empty widget falls back to the substitute's own library.
 */
export function useInSubShare(): boolean {
  return useContext(SubShareContentContext) !== null;
}

/**
 * The teacher's copy of whatever this widget would otherwise load from its
 * owner's account, bundled when the share was made.
 *
 * Returns 'off' outside the `/subs` portal, so a widget can branch on it
 * without knowing anything about sub shares. 'missing' means the share was
 * made without this item — the teacher was told at share time, and the widget
 * should render empty rather than fall back to the viewer's own library.
 */
export function useShareContent<T>(
  kind: SubShareContentKind,
  itemId: string | null | undefined
): ShareContentState<T> {
  const share = useContext(SubShareContentContext);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    payload: T | null;
  } | null>(null);

  const key =
    share && itemId
      ? `${share.shareId}::${share.version}::${kind}::${itemId}`
      : '';

  useEffect(() => {
    if (!share || !itemId) return;
    let cancelled = false;
    void share.load(kind, itemId).then((payload) => {
      if (!cancelled) setSnapshot({ key, payload: (payload as T) ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [share, kind, itemId, key]);

  if (!share || !itemId) return OFF;
  if (!snapshot || snapshot.key !== key) {
    return { status: 'loading', payload: null };
  }
  return snapshot.payload === null
    ? { status: 'missing', payload: null }
    : { status: 'ready', payload: snapshot.payload };
}
