import { doc, runTransaction } from 'firebase/firestore';
import { auth, db, isAuthBypass } from '@/config/firebase';
import { isViewAsTab } from '@/utils/viewAsTab';
import type { Dashboard } from '@/types';

export type TriggerClaims = Record<string, number>;

const CLAIM_TIMEOUT_MS = 2500;

// The claims map to write when `widgetId` wins `value`, or null when another device already took it; drops claims for widgets no longer on the board.
export const nextTriggerClaims = (
  claims: TriggerClaims | undefined,
  widgetIds: ReadonlySet<string>,
  widgetId: string,
  value: number
): TriggerClaims | null => {
  const current = claims?.[widgetId];
  if (typeof current === 'number' && current >= value) return null;
  const next: TriggerClaims = {};
  for (const [id, v] of Object.entries(claims ?? {})) {
    if (widgetIds.has(id) && typeof v === 'number') next[id] = v;
  }
  next[widgetId] = value;
  return next;
};

// True when this device should act on a widget's trigger `value`: one device wins each value, and any failure answers true as before.
export const claimBoardTrigger = async (
  boardId: string | undefined,
  widgetId: string,
  value: number
): Promise<boolean> => {
  const uid = auth?.currentUser?.uid;
  if (isAuthBypass || !uid || !boardId || isViewAsTab) return true;
  const ref = doc(db, 'users', uid, 'dashboards', boardId);
  const claim = runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return true;
    const data = snap.data() as Partial<Dashboard>;
    const ids = new Set((data.widgets ?? []).map((w) => w.id));
    const next = nextTriggerClaims(data.triggerClaims, ids, widgetId, value);
    if (!next) return false;
    tx.update(ref, { triggerClaims: next });
    return true;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), CLAIM_TIMEOUT_MS);
  });
  try {
    return await Promise.race([claim.catch(() => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
};
