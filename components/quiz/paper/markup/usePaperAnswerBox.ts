import { useEffect, useState } from 'react';
import type { PaperBatch, PaperRectMm, QuizResponse } from '@/types';
import { pageMapsForSeat } from '@/utils/paperSheetVersions';
import { writtenItemsOf } from '@/utils/paperPageMap';

/** Where one handwritten answer printed: its sheet page and box. */
export interface PaperAnswerBox {
  page: number;
  boxMm: PaperRectMm;
}

export type PaperAnswerBoxState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; box: PaperAnswerBox };

export type PaperBatchLoader = (batchId: string) => Promise<PaperBatch | null>;

/** The stack and seat a response's handwriting was scanned from. */
export function paperSeatOf(
  response: Pick<
    QuizResponse,
    'paperBatchId' | 'paperSeat' | 'paperWrittenBatchId' | 'paperWrittenSeat'
  >
): { batchId: string; seat: number } | null {
  if (response.paperWrittenBatchId && response.paperWrittenSeat !== undefined)
    return {
      batchId: response.paperWrittenBatchId,
      seat: response.paperWrittenSeat,
    };
  if (response.paperBatchId && response.paperSeat !== undefined)
    return { batchId: response.paperBatchId, seat: response.paperSeat };
  return null;
}

/** The box `questionId` printed in on `seat`'s sheet, from the batch page maps. */
export function findAnswerBox(
  batch: PaperBatch,
  seat: number,
  questionId: string
): PaperAnswerBox | null {
  for (const map of pageMapsForSeat(batch, seat) ?? []) {
    const item = writtenItemsOf(map).find((w) => w.questionId === questionId);
    if (item) return { page: map.page, boxMm: item.boxMm };
  }
  return null;
}

type Loaded = PaperBatch | 'missing';

/** Loads each stack once per grader and resolves the open answer's box; `off` when not asked. */
export function usePaperAnswerBox(args: {
  enabled: boolean;
  batchId: string | undefined;
  seat: number | undefined;
  questionId: string;
  load: PaperBatchLoader;
}): PaperAnswerBoxState {
  const { enabled, batchId, seat, questionId, load } = args;
  const [loaded, setLoaded] = useState<ReadonlyMap<string, Loaded>>(
    () => new Map()
  );
  const want = enabled && batchId ? batchId : null;
  const have = want ? loaded.get(want) : undefined;

  useEffect(() => {
    if (!want || have !== undefined) return;
    let cancelled = false;
    void load(want)
      .catch(() => null)
      .then((batch) => {
        if (cancelled) return;
        setLoaded((prev) => new Map(prev).set(want, batch ?? 'missing'));
      });
    return () => {
      cancelled = true;
    };
    // `load` is a stable loader; refetching on identity alone would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, have]);

  if (!enabled) return { status: 'off' };
  if (!want || seat === undefined) return { status: 'unavailable' };
  if (have === undefined) return { status: 'loading' };
  if (have === 'missing') return { status: 'unavailable' };
  const box = findAnswerBox(have, seat, questionId);
  return box ? { status: 'ready', box } : { status: 'unavailable' };
}
