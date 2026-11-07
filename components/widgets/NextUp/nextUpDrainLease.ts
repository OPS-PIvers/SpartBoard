import {
  deleteField,
  doc,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import type { NextUpDrainLease } from '@/types';

/** Joins left untouched this long under another tab's lease mean that tab is gone. */
export const NEXT_UP_TAKEOVER_MS = 10_000;
/** A drain whose Drive write failed is tried again after this long. */
export const NEXT_UP_RETRY_MS = 10_000;
const CLAIM_TIMEOUT_MS = 8_000;

/** Names this tab in the lease; a reload is a new tab. */
export const NEXT_UP_TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface DrainClaim {
  /** This tab may drain now. */
  won: boolean;
  /** This tab just took the lease, so its queue and entries may be stale. */
  acquired: boolean;
  /** The lease sequence the server holds after the claim. */
  seq: number;
}

const leaseOf = (value: unknown): NextUpDrainLease | null => {
  if (!value || typeof value !== 'object') return null;
  const { clientId, seq } = value as Partial<NextUpDrainLease>;
  if (typeof clientId !== 'string' || typeof seq !== 'number') return null;
  return { clientId, seq };
};

// The lease to write (or null to leave it) and the verdict, for one claim; a takeover wins only if the lease is still the one this tab saw stall.
export const decideDrainClaim = (
  current: unknown,
  clientId: string,
  takeoverSeq?: number
): { claim: DrainClaim; write: NextUpDrainLease | null } => {
  const lease = leaseOf(current);
  if (lease?.clientId === clientId) {
    return {
      claim: { won: true, acquired: false, seq: lease.seq },
      write: null,
    };
  }
  if (!lease || lease.seq === takeoverSeq) {
    const write = { clientId, seq: (lease?.seq ?? 0) + 1 };
    return { claim: { won: true, acquired: true, seq: write.seq }, write };
  }
  return {
    claim: { won: false, acquired: false, seq: lease.seq },
    write: null,
  };
};

// Claims the drain lease on the session doc; a failed or slow claim drains as before, so the queue never stops taking joins.
export const claimNextUpDrain = async (
  sessionId: string,
  clientId: string,
  takeoverSeq?: number
): Promise<DrainClaim> => {
  const fallback: DrainClaim = { won: true, acquired: false, seq: -1 };
  if (isAuthBypass) return fallback;
  const ref = doc(db, 'nextup_sessions', sessionId);
  const claim = runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return fallback;
    const data = snap.data() as { drainLease?: unknown };
    const { claim: verdict, write } = decideDrainClaim(
      data.drainLease,
      clientId,
      takeoverSeq
    );
    if (write) tx.update(ref, { drainLease: write });
    return verdict;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<DrainClaim>((resolve) => {
    timer = setTimeout(() => resolve(fallback), CLAIM_TIMEOUT_MS);
  });
  try {
    return await Promise.race([claim.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

// Hands the lease back when this tab leaves, so another tab takes the next join without waiting.
export const releaseNextUpDrain = async (
  sessionId: string,
  clientId: string,
  confirm: boolean
): Promise<void> => {
  if (isAuthBypass) return;
  const ref = doc(db, 'nextup_sessions', sessionId);
  // A page that is closing has no time for a transaction.
  if (!confirm) {
    await updateDoc(ref, { drainLease: deleteField() });
    return;
  }
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const lease = leaseOf((snap.data() as { drainLease?: unknown }).drainLease);
    if (lease?.clientId === clientId) {
      tx.update(ref, { drainLease: deleteField() });
    }
  });
};

export interface EntryLike {
  id: string;
}

export interface DrainController<T extends EntryLike> {
  /** The latest entries the listener saw. */
  onEntries: (entries: T[]) => void;
  /** Whether this tab's last claim won the lease. */
  holding: () => boolean;
  /** Stops timers and reports whether this tab last held the lease. */
  stop: () => boolean;
}

// One tab drains: each drain claims the lease first, and a tab that loses takes over only when the joins it saw stay put for the takeover window.
export function createNextUpDrainController<T extends EntryLike>(opts: {
  claim: (takeoverSeq?: number) => Promise<DrainClaim>;
  drain: (entries: T[], acquired: boolean) => Promise<void>;
  takeoverMs?: number;
  retryMs?: number;
}): DrainController<T> {
  const takeoverMs = opts.takeoverMs ?? NEXT_UP_TAKEOVER_MS;
  const retryMs = opts.retryMs ?? NEXT_UP_RETRY_MS;
  let latest: T[] = [];
  let running = false;
  let again = false;
  let stopped = false;
  let holder = false;
  let watch: { ids: Set<string>; seq: number; due: boolean } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (ms: number, before?: () => void) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      before?.();
      void run();
    }, ms);
  };

  const step = async (): Promise<void> => {
    if (latest.length === 0) {
      watch = null;
      clearTimeout(timer);
      return;
    }
    let takeoverSeq: number | undefined;
    if (watch) {
      const { ids } = watch;
      if (!latest.some((entry) => ids.has(entry.id))) {
        // The holder took those joins, so it is alive; check again for the new ones.
        watch = null;
        clearTimeout(timer);
      } else if (!watch.due) {
        return;
      } else {
        takeoverSeq = watch.seq;
      }
    }
    const claim = await opts.claim(takeoverSeq);
    if (stopped) return;
    holder = claim.won && claim.seq >= 0;
    if (!claim.won) {
      const next = {
        ids: new Set(latest.map((entry) => entry.id)),
        seq: claim.seq,
        due: false,
      };
      watch = next;
      schedule(takeoverMs, () => {
        next.due = true;
      });
      return;
    }
    watch = null;
    clearTimeout(timer);
    try {
      await opts.drain(latest, claim.acquired);
    } catch (error) {
      console.error('[NextUp] Failed to add students to the queue:', error);
      if (!stopped) schedule(retryMs);
    }
  };

  const run = async (): Promise<void> => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await step();
      } while (again && !stopped);
    } finally {
      running = false;
    }
  };

  return {
    onEntries: (entries) => {
      latest = entries;
      void run();
    },
    holding: () => holder,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      return holder;
    },
  };
}
