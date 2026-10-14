/** The capture whose take is in progress; cutoffs commit it before their rule runs (D16). */
export interface ActiveTake {
  commitNow: () => Promise<void>;
}

const COMMIT_WAIT_MS = 10_000;

let active: ActiveTake | null = null;

/** Returns the unregister function; a stale unregister never clears a newer capture. */
export function registerActiveTake(take: ActiveTake): () => void {
  active = take;
  return () => {
    if (active === take) active = null;
  };
}

/** Commits the running or pending take, if any; never rejects and never waits past the cap. */
export async function commitActiveTake(
  waitMs: number = COMMIT_WAIT_MS
): Promise<void> {
  const take = active;
  if (!take) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      take.commitNow(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
  } catch (err) {
    console.error('[activeTake] commit before cutoff failed:', err);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
