import { describe, expect, it, vi } from 'vitest';
import type { QuizResponse } from '@/types';
import {
  createKeptPageLoader,
  fetchKeptPages,
  keptPageRefs,
  keptPageScanId,
  type KeptPageRef,
} from '@/utils/paperPageFetch';
import { keptPageArtifactFor, scanResponse } from './fixtures/scanSheetFixture';

const ref = (page: number, archive?: KeptPageRef['archive']): KeptPageRef => ({
  responseKey: 'paper-1',
  page,
  artifact: keptPageArtifactFor('scan-A', page),
  ...(archive ? { archive } : {}),
});

describe('keptPageRefs', () => {
  it('asks for nothing when the response kept no pages', () => {
    expect(keptPageRefs(scanResponse(), 'paper-1', [1, 2])).toEqual([]);
  });

  it('asks only for pages listed in paperPages', () => {
    const refs = keptPageRefs(
      scanResponse({ keptPages: [2] }),
      'paper-1',
      [1, 2, 3]
    );
    expect(refs.map((r) => r.page)).toEqual([2]);
    expect(refs[0].artifact.id).toBe('pg_scan-A_2');
  });

  it('skips a page from another scan than the graded answers', () => {
    const stale = scanResponse({ keptPages: [1, 2], answerScanId: 'scan-B' });
    expect(keptPageRefs(stale, 'paper-1', [1, 2])).toEqual([]);
  });

  it('skips pages when the answers come from two scans', () => {
    const r = scanResponse({ keptPages: [1] });
    const mixed = {
      ...r,
      answers: r.answers.map((a) =>
        a.questionId === 'w2' ? { ...a, paperScanId: 'scan-B' } : a
      ),
    };
    expect(keptPageRefs(mixed, 'paper-1', [1])).toEqual([]);
  });

  it('carries the archive entry so an archived page reads from Drive', () => {
    const r = {
      ...scanResponse({ keptPages: [1] }),
      artifactArchive: {
        'pg_scan-A_1': { archiveStatus: 'archived', driveFileId: 'drive-1' },
      },
    } as unknown as QuizResponse;
    expect(keptPageRefs(r, 'paper-1', [1])[0].archive?.driveFileId).toBe(
      'drive-1'
    );
  });

  it('reads the scan out of an artifact id', () => {
    expect(keptPageScanId('pg_scan-A_12')).toBe('scan-A');
    expect(keptPageScanId('crop-1')).toBeNull();
  });
});

describe('createKeptPageLoader', () => {
  const ready = {
    status: 'ready' as const,
    mimeType: 'image/webp' as const,
    data: btoa('webp-bytes'),
    source: 'storage' as const,
  };

  it('turns a ready page into a Blob of its bytes', async () => {
    const callPage = vi.fn().mockResolvedValue(ready);
    const blob = await createKeptPageLoader({ callPage })('s1', ref(2));
    expect(callPage).toHaveBeenCalledWith({
      sessionId: 's1',
      responseKey: 'paper-1',
      page: 2,
    });
    expect(blob?.type).toBe('image/webp');
    expect(await blob?.text()).toBe('webp-bytes');
  });

  it('treats a page the server has not got as no page', async () => {
    const callPage = vi
      .fn()
      .mockResolvedValue({ status: 'not-available', reason: 'no-page' });
    expect(await createKeptPageLoader({ callPage })('s1', ref(1))).toBeNull();
  });

  it('turns a refusal (a teammate, the flag off) into no page, quietly', async () => {
    const err = Object.assign(
      new Error('Kept pages are not enabled for this account.'),
      {
        code: 'functions/permission-denied',
      }
    );
    const onFailure = vi.fn();
    const load = createKeptPageLoader({
      callPage: vi.fn().mockRejectedValue(err),
      onFailure,
    });
    await expect(load('s1', ref(1))).resolves.toBeNull();
    expect(onFailure).toHaveBeenCalledWith(ref(1), err);
  });

  it('reads an archived page from Drive and skips the callable', async () => {
    const callPage = vi.fn();
    const fetchDriveBlob = vi.fn().mockResolvedValue(new Blob(['drive']));
    const blob = await createKeptPageLoader({ callPage, fetchDriveBlob })(
      's1',
      ref(1, { archiveStatus: 'archived', driveFileId: 'd1' } as never)
    );
    expect(await blob?.text()).toBe('drive');
    expect(callPage).not.toHaveBeenCalled();
  });

  it('falls back to the callable when Drive fails', async () => {
    const callPage = vi.fn().mockResolvedValue(ready);
    const fetchDriveBlob = vi.fn().mockRejectedValue(new Error('no grant'));
    const blob = await createKeptPageLoader({ callPage, fetchDriveBlob })(
      's1',
      ref(1, { archiveStatus: 'archived', driveFileId: 'd1' } as never)
    );
    expect(await blob?.text()).toBe('webp-bytes');
  });

  it('does not ask for a page that was deleted', async () => {
    const callPage = vi.fn();
    const blob = await createKeptPageLoader({ callPage })(
      's1',
      ref(1, { archiveStatus: 'deleted' } as never)
    );
    expect(blob).toBeNull();
    expect(callPage).not.toHaveBeenCalled();
  });
});

describe('fetchKeptPages', () => {
  it('keeps at most the limit in flight and reports every page, failures as null', async () => {
    let inFlight = 0;
    let peak = 0;
    const load = vi.fn(async (_s: string, r: KeptPageRef) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((res) => setTimeout(res, 2));
      inFlight -= 1;
      if (r.page === 3) throw new Error('boom');
      return r.page === 4 ? null : new Blob([String(r.page)]);
    });
    const got = new Map<number, Blob | null>();
    await fetchKeptPages(
      's1',
      Array.from({ length: 10 }, (_, i) => ref(i + 1)),
      load,
      (r, b) => got.set(r.page, b),
      { limit: 3 }
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(got.size).toBe(10);
    expect(got.get(3)).toBeNull();
    expect(got.get(4)).toBeNull();
    expect(got.get(5)).toBeInstanceOf(Blob);
  });

  it('stops once cancelled', async () => {
    let cancelled = false;
    const onPage = vi.fn(() => {
      cancelled = true;
    });
    await fetchKeptPages(
      's1',
      [ref(1), ref(2), ref(3)],
      () => Promise.resolve(new Blob(['x'])),
      onPage,
      { limit: 1, cancelled: () => cancelled }
    );
    expect(onPage).toHaveBeenCalledTimes(1);
  });
});
