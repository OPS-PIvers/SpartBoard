import { describe, it, expect, vi } from 'vitest';
import {
  PaperCropUnavailableError,
  createPaperCropResolver,
  isScanSuperseded,
  needsSnapshotConfirm,
  paperCropSource,
  transcriptHtmlToEditText,
  uncertainSnippets,
  type PaperCropRequest,
} from '@/utils/paperCropFetch';
import type { ResponseArtifact } from '@/types';

const artifact: ResponseArtifact = {
  id: 'hw_scan1_q1',
  slot: 'primary',
  kind: 'handwriting',
  storagePath: 'paper_written_crops/t1/scan1/3/q1.webp',
  mimeType: 'image/webp',
  uploadState: 'uploaded',
};

const req = (over: Partial<PaperCropRequest> = {}): PaperCropRequest => ({
  sessionId: 's1',
  responseKey: 'r1',
  questionId: 'q1',
  artifact,
  ...over,
});

const ready = {
  status: 'ready' as const,
  mimeType: 'image/webp' as const,
  data: 'AAAA',
  source: 'storage' as const,
};

describe('paperCropSource', () => {
  it('reads Drive once archived and the callable before that', () => {
    expect(paperCropSource(artifact, undefined)).toBe('callable');
    expect(paperCropSource(artifact, { archiveStatus: 'awaiting-drive' })).toBe(
      'callable'
    );
    expect(
      paperCropSource(artifact, {
        archiveStatus: 'archived',
        driveFileId: 'f1',
      })
    ).toBe('drive');
  });

  it('has no source for a missing or deleted crop', () => {
    expect(paperCropSource(null, undefined)).toBeNull();
    expect(paperCropSource(artifact, { archiveStatus: 'deleted' })).toBeNull();
    expect(paperCropSource(artifact, { archiveStatus: 'lost' })).toBeNull();
  });
});

describe('createPaperCropResolver', () => {
  it('fetches an archived crop straight from Drive', async () => {
    const resolveDriveFile = vi.fn().mockResolvedValue('blob:drive');
    const callCrop = vi.fn();
    const resolve = createPaperCropResolver({ resolveDriveFile, callCrop });
    const url = await resolve(
      req({ archive: { archiveStatus: 'archived', driveFileId: 'f1' } })
    );
    expect(url).toBe('blob:drive');
    expect(resolveDriveFile).toHaveBeenCalledWith('f1');
    expect(callCrop).not.toHaveBeenCalled();
  });

  it('falls back to the callable when Drive fails', async () => {
    const resolve = createPaperCropResolver({
      resolveDriveFile: vi.fn().mockRejectedValue(new Error('(403)')),
      callCrop: vi.fn().mockResolvedValue(ready),
    });
    await expect(
      resolve(
        req({ archive: { archiveStatus: 'archived', driveFileId: 'f1' } })
      )
    ).resolves.toBe('data:image/webp;base64,AAAA');
  });

  it('asks the callable by answer before archival', async () => {
    const callCrop = vi.fn().mockResolvedValue(ready);
    const resolve = createPaperCropResolver({ callCrop });
    await resolve(req({ archive: { archiveStatus: 'awaiting-drive' } }));
    expect(callCrop).toHaveBeenCalledWith({
      sessionId: 's1',
      responseKey: 'r1',
      questionId: 'q1',
    });
  });

  it('previews the newer scan through the callable', async () => {
    const callCrop = vi.fn().mockResolvedValue(ready);
    const resolve = createPaperCropResolver({ callCrop });
    await resolve(req({ artifact: null, scan: 'newer' }));
    expect(callCrop).toHaveBeenCalledWith(
      expect.objectContaining({ scan: 'newer' })
    );
  });

  it('reports why a crop is unavailable', async () => {
    const resolve = createPaperCropResolver({
      callCrop: vi
        .fn()
        .mockResolvedValue({ status: 'not-available', reason: 'missing' }),
    });
    const err = await resolve(req()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaperCropUnavailableError);
    expect((err as PaperCropUnavailableError).reason).toBe('missing');

    const none = await createPaperCropResolver({ callCrop: vi.fn() })(
      req({ artifact: null })
    ).catch((e: unknown) => e);
    expect((none as PaperCropUnavailableError).reason).toBe('no-crop');
  });
});

describe('transcript helpers', () => {
  it('turns paragraphs into blank-line separated text', () => {
    expect(transcriptHtmlToEditText('<p>One two.</p><p>Three.</p>')).toBe(
      'One two.\n\nThree.'
    );
    expect(transcriptHtmlToEditText('')).toBe('');
  });

  it('cuts each uncertain span with a little context', () => {
    const raw = 'the quick brown fox jumps over the lazy dog today';
    const start = raw.indexOf('jumps');
    const [s] = uncertainSnippets(raw, [{ start, end: start + 5 }]);
    expect(s.flagged).toBe('jumps');
    expect(s.before).toBe('…quick brown fox ');
    expect(s.after).toBe(' over the lazy…');
    expect(uncertainSnippets(raw, undefined)).toEqual([]);
    expect(uncertainSnippets(undefined, [{ start: 0, end: 2 }])).toEqual([]);
  });

  it('recognizes the snapshot confirm and superseded errors', () => {
    expect(
      needsSnapshotConfirm({
        code: 'functions/failed-precondition',
        details: { reason: 'confirm-snapshot-rewrite' },
      })
    ).toBe(true);
    expect(
      needsSnapshotConfirm({ code: 'functions/failed-precondition' })
    ).toBe(false);
    expect(isScanSuperseded({ code: 'functions/aborted' })).toBe(true);
    expect(isScanSuperseded(new Error('x'))).toBe(false);
  });
});
