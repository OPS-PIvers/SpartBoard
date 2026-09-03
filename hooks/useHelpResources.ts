import { useContext, useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { AuthContext } from '@/context/AuthContextValue';
import type { WidgetType } from '@/types';
import type { HelpCategory, HelpResourceItem } from '@/types/helpCenter';
import {
  normalizeHelpCenterConfig,
  normalizeHelpResourceItem,
  sortHelpItems,
} from '@/utils/helpCenterNormalize';
import { logError } from '@/utils/logError';

interface UseHelpResourcesOptions {
  includeHidden: boolean;
  // Super admins read the whole collection instead of the global + own-org queries.
  allOrgs?: boolean;
}

export interface UseHelpResourcesResult {
  items: HelpResourceItem[];
  categories: HelpCategory[];
  loading: boolean;
  error: string | null;
}

const mergeById = (
  globalItems: HelpResourceItem[],
  orgItems: HelpResourceItem[]
): HelpResourceItem[] => {
  const byId = new Map<string, HelpResourceItem>();
  for (const item of globalItems) byId.set(item.id, item);
  for (const item of orgItems) byId.set(item.id, item);
  return Array.from(byId.values());
};

export const useHelpResources = ({
  includeHidden,
  allOrgs = false,
}: UseHelpResourcesOptions): UseHelpResourcesResult => {
  const { orgId } = useAuth();
  const [categories, setCategories] = useState<HelpCategory[]>([]);
  const [globalItems, setGlobalItems] = useState<HelpResourceItem[]>([]);
  const [allItems, setAllItems] = useState<HelpResourceItem[]>([]);
  const [allLoaded, setAllLoaded] = useState(false);
  const [orgItems, setOrgItems] = useState<HelpResourceItem[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [globalLoaded, setGlobalLoaded] = useState(false);
  const [orgLoaded, setOrgLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reset orgLoaded synchronously when orgId changes, during render rather than in an effect (CLAUDE.md "adjusting state while rendering").
  const [trackedOrgId, setTrackedOrgId] = useState(orgId);
  if (trackedOrgId !== orgId) {
    setTrackedOrgId(orgId);
    setOrgLoaded(false);
  }
  const [trackedAllOrgs, setTrackedAllOrgs] = useState(allOrgs);
  if (trackedAllOrgs !== allOrgs) {
    setTrackedAllOrgs(allOrgs);
    setAllLoaded(false);
    setGlobalLoaded(false);
  }

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'help_center', 'config'),
      (snap) => {
        setCategories(normalizeHelpCenterConfig(snap.data()).categories);
        setConfigLoaded(true);
        setError(null);
      },
      (err) => {
        logError('useHelpResources config', err);
        setConfigLoaded(true);
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (allOrgs) return;
    const q = query(
      collection(db, 'help_resources'),
      where('orgId', '==', null)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: HelpResourceItem[] = [];
        snap.docs.forEach((d) => {
          const normalized = normalizeHelpResourceItem(d.id, d.data());
          if (normalized) next.push(normalized);
        });
        setGlobalItems(next);
        setGlobalLoaded(true);
        setError(null);
      },
      (err) => {
        logError('useHelpResources global', err);
        setGlobalLoaded(true);
      }
    );
    return unsub;
  }, [allOrgs]);

  useEffect(() => {
    if (!allOrgs) return;
    const unsub = onSnapshot(
      collection(db, 'help_resources'),
      (snap) => {
        const next: HelpResourceItem[] = [];
        snap.docs.forEach((d) => {
          const normalized = normalizeHelpResourceItem(d.id, d.data());
          if (normalized) next.push(normalized);
        });
        setAllItems(next);
        setAllLoaded(true);
        setError(null);
      },
      (err) => {
        logError('useHelpResources allOrgs', err);
        setAllLoaded(true);
        setError(err instanceof Error ? err.message : String(err));
      }
    );
    return unsub;
  }, [allOrgs]);

  useEffect(() => {
    // No org query to run; the render-time fallback below reports loaded.
    if (!orgId || allOrgs) return;
    const q = query(
      collection(db, 'help_resources'),
      where('orgId', '==', orgId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: HelpResourceItem[] = [];
        snap.docs.forEach((d) => {
          const normalized = normalizeHelpResourceItem(d.id, d.data());
          if (normalized) next.push(normalized);
        });
        setOrgItems(next);
        setOrgLoaded(true);
        setError(null);
      },
      (err) => {
        // Teacher hook must tolerate permission-denied on the org query.
        logError('useHelpResources org', err);
        setOrgItems([]);
        setOrgLoaded(true);
        setError(err instanceof Error ? err.message : String(err));
      }
    );
    return unsub;
  }, [orgId, allOrgs]);

  const effectiveOrgItems = orgId ? orgItems : [];
  const effectiveOrgLoaded = orgId ? orgLoaded : true;
  const merged = allOrgs ? allItems : mergeById(globalItems, effectiveOrgItems);
  const visible = includeHidden
    ? merged
    : merged.filter((item) => item.visible !== false);

  return {
    items: sortHelpItems(visible, categories),
    categories,
    loading:
      !configLoaded ||
      (allOrgs ? !allLoaded : !globalLoaded || !effectiveOrgLoaded),
    error,
  };
};

// Module-level shared listener: created lazily on the first subscriber, torn down when the last unsubscribes, so many SettingsPanel mounts share one Firestore subscription per page.
interface SharedHelpState {
  items: HelpResourceItem[];
  loading: boolean;
}

let sharedState: SharedHelpState = { items: [], loading: true };
let sharedGlobalItems: HelpResourceItem[] = [];
let sharedOrgItems: HelpResourceItem[] = [];
let sharedGlobalLoaded = false;
let sharedOrgLoaded = true;
let sharedOrgId: string | null | undefined;
let unsubGlobal: (() => void) | null = null;
let unsubOrg: (() => void) | null = null;
const sharedSubscribers = new Set<(state: SharedHelpState) => void>();

const notifySharedSubscribers = () => {
  sharedState = {
    items: mergeById(sharedGlobalItems, sharedOrgItems).filter(
      (item) => item.visible !== false
    ),
    loading: !sharedGlobalLoaded || !sharedOrgLoaded,
  };
  sharedSubscribers.forEach((cb) => cb(sharedState));
};

const startSharedListener = () => {
  unsubGlobal = onSnapshot(
    query(collection(db, 'help_resources'), where('orgId', '==', null)),
    (snap) => {
      sharedGlobalItems = [];
      snap.docs.forEach((d) => {
        const normalized = normalizeHelpResourceItem(d.id, d.data());
        if (normalized) sharedGlobalItems.push(normalized);
      });
      sharedGlobalLoaded = true;
      notifySharedSubscribers();
    },
    (err) => {
      logError('useHelpItemsForWidget global', err);
      sharedGlobalLoaded = true;
      notifySharedSubscribers();
    }
  );
};

const startSharedOrgListener = (orgId: string | null) => {
  if (unsubOrg) {
    unsubOrg();
    unsubOrg = null;
  }
  sharedOrgId = orgId;
  if (!orgId) {
    sharedOrgItems = [];
    sharedOrgLoaded = true;
    notifySharedSubscribers();
    return;
  }
  sharedOrgLoaded = false;
  unsubOrg = onSnapshot(
    query(collection(db, 'help_resources'), where('orgId', '==', orgId)),
    (snap) => {
      sharedOrgItems = [];
      snap.docs.forEach((d) => {
        const normalized = normalizeHelpResourceItem(d.id, d.data());
        if (normalized) sharedOrgItems.push(normalized);
      });
      sharedOrgLoaded = true;
      notifySharedSubscribers();
    },
    (err) => {
      logError('useHelpItemsForWidget org', err);
      sharedOrgItems = [];
      sharedOrgLoaded = true;
      notifySharedSubscribers();
    }
  );
};

export const useHelpItemsForWidget = (
  widgetType: WidgetType
): HelpResourceItem[] => {
  // Read the context directly so the settings panel still renders outside an AuthProvider (tests, standalone surfaces).
  const orgId = useContext(AuthContext)?.orgId ?? null;
  const [state, setState] = useState<SharedHelpState>(sharedState);
  const subscriberRef = useRef<((state: SharedHelpState) => void) | null>(null);

  useEffect(() => {
    // No Firebase project configured (tests, static surfaces): skip the listeners entirely.
    if (!isConfigured) return;
    const listener = (next: SharedHelpState) => setState(next);
    subscriberRef.current = listener;
    if (sharedSubscribers.size === 0) {
      startSharedListener();
      startSharedOrgListener(orgId);
    }
    sharedSubscribers.add(listener);
    setState(sharedState);
    return () => {
      sharedSubscribers.delete(listener);
      if (sharedSubscribers.size === 0) {
        unsubGlobal?.();
        unsubGlobal = null;
        unsubOrg?.();
        unsubOrg = null;
        sharedGlobalItems = [];
        sharedOrgItems = [];
        sharedGlobalLoaded = false;
        sharedOrgLoaded = true;
        sharedOrgId = undefined;
        sharedState = { items: [], loading: true };
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    if (sharedSubscribers.size > 0 && sharedOrgId !== orgId) {
      startSharedOrgListener(orgId);
    }
  }, [orgId]);

  return state.items.filter((item) => item.widgetTypes.includes(widgetType));
};

// Deduped per item per page load so reopening the same guide counts once.
const countedHelpItemIds = new Set<string>();

export const incrementHelpOpenCount = async (itemId: string): Promise<void> => {
  if (countedHelpItemIds.has(itemId)) return;
  countedHelpItemIds.add(itemId);
  try {
    await updateDoc(doc(db, 'help_resources', itemId), {
      openCount: increment(1),
    });
  } catch (err) {
    console.warn('[useHelpResources] open count not recorded', err);
  }
};
