import { useState } from 'react';
import {
  orgSubscriptionKey,
  shouldClearOnOrgKeyChange,
} from '@/utils/orgSubscriptionKey';

/**
 * Detects `shouldSubscribe`/`orgId` transitions for org-scoped Firestore
 * subscription hooks and tells the caller whether to reset. Adjusts state
 * during render (not a `useEffect`) so a transition is applied in the SAME
 * render that observes it — a consumer reading the hook's data this render
 * never sees the prior org's stale value.
 *
 * `onTransition` fires exactly once per key change, with `shouldClear` true
 * when the subscription is turning off OR staying on for a *different* org
 * (see `shouldClearOnOrgKeyChange`). Callers should always reset their
 * `loading` flag from `shouldSubscribe` and clear their data state when
 * `shouldClear` is true.
 */
export function useOrgSubscriptionReset(
  shouldSubscribe: boolean,
  orgId: string | null,
  onTransition: (shouldClear: boolean) => void
): void {
  const nextKey = orgSubscriptionKey(shouldSubscribe, orgId);
  const [prevKey, setPrevKey] = useState(nextKey);
  if (prevKey !== nextKey) {
    const shouldClear = shouldClearOnOrgKeyChange(
      shouldSubscribe,
      orgId,
      prevKey
    );
    setPrevKey(nextKey);
    onTransition(shouldClear);
  }
}
