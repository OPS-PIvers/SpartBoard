/**
 * Map over `items` with at most `limit` async tasks running at once, returning
 * results in the SAME order as the input (like Promise.all, but bounded).
 *
 * A worker pool claims indices atomically and writes each result into its fixed
 * position, so the output order matches the input regardless of completion
 * order. Bounding the parallelism keeps a steady, polite request rate when the
 * mapper hits a rate-limited resource (e.g. one network download per item)
 * instead of bursting every request in the same tick.
 *
 * Rejections propagate (matching Promise.all): the first mapper rejection
 * rejects the returned promise.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  // Clamp `limit` to a finite positive integer first: a NaN / Infinity limit
  // would make `workerCount` NaN, and `Array.from({ length: NaN })` is empty —
  // silently doing no work and returning an unfilled array. Then cap workers at
  // the number of items so a short list doesn't spin up idle workers (and a
  // 0 / negative limit can't stall forever).
  const safeLimit =
    Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1;
  const workerCount = Math.max(1, Math.min(safeLimit, items.length));

  const worker = async (): Promise<void> => {
    // Each worker pulls the next unclaimed index until the queue drains.
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
