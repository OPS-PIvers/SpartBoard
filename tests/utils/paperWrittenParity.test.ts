import { describe, it, expect } from 'vitest';
import type { PaperPrivateStatus } from '@/types';
import * as client from '@/utils/paperWritten';
import * as server from '@/functions/src/paperWrittenTypes';

describe('paperWritten client/server parity', () => {
  it('shares constants', () => {
    expect(server.PAPER_HANDWRITTEN_FEATURE).toBe(
      client.PAPER_HANDWRITTEN_FEATURE
    );
    expect(server.PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT).toBe(
      client.PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT
    );
    expect(server.PAPER_WRITTEN_CROP_PREFIX).toBe(
      client.PAPER_WRITTEN_CROP_PREFIX
    );
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
    ];
    for (const status of statuses) {
      expect(server.publicTranscriptState(status)).toBe(
        client.publicTranscriptState(status)
      );
    }
  });
});
