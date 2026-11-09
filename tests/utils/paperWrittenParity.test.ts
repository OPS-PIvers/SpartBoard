import { describe, it, expect } from 'vitest';
import type { PaperPrivateStatus } from '@/types';
import * as client from '@/utils/paperWritten';
import * as server from '@/functions/src/paperWrittenTypes';

describe('paperWritten client/server parity', () => {
  it('shares constants', () => {
    expect(server.PAPER_HANDWRITTEN_FEATURE).toBe(
      client.PAPER_HANDWRITTEN_FEATURE
    );
    expect(server.PAPER_HANDWRITING_AI_FEATURE).toBe(
      client.PAPER_HANDWRITING_AI_FEATURE
    );
    expect(server.PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT).toBe(
      client.PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT
    );
    expect(server.PAPER_WRITTEN_CROP_PREFIX).toBe(
      client.PAPER_WRITTEN_CROP_PREFIX
    );
    expect(server.PAPER_PAGE_PREFIX).toBe(client.PAPER_PAGE_PREFIX);
    expect(server.PAPER_PAGE_CALLABLE).toBe(client.PAPER_PAGE_CALLABLE);
    expect(server.PAPER_KEPT_PAGES_FEATURE).toBe(
      client.PAPER_KEPT_PAGES_FEATURE
    );
    expect(server.PAPER_IMAGE_MARKUP_FEATURE).toBe(
      client.PAPER_IMAGE_MARKUP_FEATURE
    );
  });

  it('builds the same kept-page paths and ids', () => {
    expect(client.paperPageStoragePath('u', 's', 7, 2)).toBe(
      'paper_pages/u/s/7/2.webp'
    );
    expect(server.paperPageStoragePath('u', 's', 7, 2)).toBe(
      client.paperPageStoragePath('u', 's', 7, 2)
    );
    expect(server.paperPageArtifactId('scan-1', 3)).toBe(
      client.paperPageArtifactId('scan-1', 3)
    );
    for (const id of [
      'pg_scan-1_3',
      'pg_scan-1_12',
      'hw_scan-1_q1',
      'pg_a_b',
    ]) {
      expect(server.paperPageNumberOf(id)).toBe(client.paperPageNumberOf(id));
    }
    expect(client.paperPageNumberOf('pg_scan-1_12')).toBe(12);
    expect(client.paperPageNumberOf('hw_scan-1_q1')).toBeNull();
  });

  it('finds a kept page by its sheet page number', () => {
    const page = (p: number) => ({
      id: client.paperPageArtifactId('scan-1', p),
      slot: 'primary' as const,
      kind: 'paper-page' as const,
      storagePath: client.paperPageStoragePath('t', 'scan-1', 3, p),
      uploadState: 'uploaded' as const,
    });
    const response = { paperPages: [page(1), page(11)] };
    expect(client.keptPageArtifact(response, 1)?.id).toBe('pg_scan-1_1');
    expect(client.keptPageArtifact(response, 11)?.id).toBe('pg_scan-1_11');
    expect(client.keptPageArtifact(response, 2)).toBeNull();
    expect(client.keptPageArtifact({}, 1)).toBeNull();
  });

  it('builds the same paths and ids', () => {
    expect(server.paperCropStoragePath('u', 's', 7, 'q')).toBe(
      client.paperCropStoragePath('u', 's', 7, 'q')
    );
    expect(server.paperTranscriptionJobId('s', 7, 2, 1)).toBe(
      client.paperTranscriptionJobId('s', 7, 2, 1)
    );
  });

  it('maps private status to public state the same way', () => {
    const statuses: PaperPrivateStatus[] = [
      'pending',
      'done',
      'failed',
      'blank',
      'over-quota',
      'image',
    ];
    for (const status of statuses) {
      expect(server.publicTranscriptState(status)).toBe(
        client.publicTranscriptState(status)
      );
    }
  });
});
