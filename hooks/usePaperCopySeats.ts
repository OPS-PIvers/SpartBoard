import { useEffect, useState } from 'react';
import { getPaperBatch } from '@/utils/paperBatchStore';
import { paperCopySeatKeys } from '@/utils/paperCopySeats';
import type { PaperBatch } from '@/types';

export type LoadPaperBatch = (
  teacherUid: string,
  batchId: string
) => Promise<Pick<PaperBatch, 'seats'> | null>;

const EMPTY: ReadonlySet<string> = new Set();

/** Roster students holding a printed group copy of this assignment, as `rosterId:studentId` keys. */
export function usePaperCopySeats(
  teacherUid: string | null | undefined,
  batchIds: readonly string[] | null | undefined,
  load: LoadPaperBatch = getPaperBatch
): ReadonlySet<string> {
  const idsKey = [...(batchIds ?? [])].sort().join(',');
  const [loaded, setLoaded] = useState<{
    key: string;
    seats: ReadonlySet<string>;
  } | null>(null);
  useEffect(() => {
    if (!teacherUid || !idsKey) return;
    let cancelled = false;
    void Promise.all(
      idsKey.split(',').map((id) =>
        load(teacherUid, id).catch((err: unknown) => {
          console.error('[usePaperCopySeats] batch read failed', err);
          return null;
        })
      )
    ).then((batches) => {
      if (cancelled) return;
      setLoaded({
        key: `${teacherUid}|${idsKey}`,
        seats: paperCopySeatKeys(batches.filter((b) => b !== null)),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [teacherUid, idsKey, load]);
  return loaded && loaded.key === `${teacherUid}|${idsKey}`
    ? loaded.seats
    : EMPTY;
}
