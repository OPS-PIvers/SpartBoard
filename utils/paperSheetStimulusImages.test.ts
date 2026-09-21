import { describe, expect, it, vi } from 'vitest';
import type { PaperSheetStimulus } from '@/types';
import { driveImageUrl } from './quizStimuli';
import {
  resolveStimulusImages,
  stimulusLoadErrorMessage,
  type StimulusImageDeps,
} from './paperSheetStimulusImages';

const stimulus = (
  over: Partial<PaperSheetStimulus> = {}
): PaperSheetStimulus => ({
  id: 'stim-1',
  label: 'Unit 3 graph',
  source: 'image',
  driveFileId: 'drive-1',
  ...over,
});

const deps = (over: Partial<StimulusImageDeps> = {}): StimulusImageDeps => ({
  downloadAsBlob: vi.fn(() => Promise.resolve(new Blob(['x']))),
  preload: vi.fn(() => Promise.resolve(true)),
  createObjectUrl: vi.fn((blob: Blob) => `blob:${blob.size}`),
  revokeObjectUrl: vi.fn(),
  ...over,
});

describe('resolveStimulusImages', () => {
  it("fetches the owner's own file with their token rather than a public URL", async () => {
    const d = deps();
    const result = await resolveStimulusImages([stimulus()], d);

    expect(d.downloadAsBlob).toHaveBeenCalledWith('drive-1');
    expect(d.preload).not.toHaveBeenCalled();
    expect(result.src['stim-1']).toBe('blob:1');
    expect(result.failed).toEqual([]);
  });

  it('falls back to the link-shared URL when the token cannot read the file', async () => {
    // This is a teammate printing the owner's stack: `drive.file` gives them
    // nothing, so the only route is the sharing D6 asks the owner for.
    const d = deps({ downloadAsBlob: vi.fn(() => Promise.resolve(null)) });
    const result = await resolveStimulusImages([stimulus()], d);

    expect(d.preload).toHaveBeenCalledWith(driveImageUrl('drive-1'));
    expect(result.src['stim-1']).toBe(driveImageUrl('drive-1'));
    expect(result.failed).toEqual([]);
  });

  it('treats a thrown download as a miss rather than failing the whole print', async () => {
    const d = deps({
      downloadAsBlob: vi.fn(() => Promise.reject(new Error('401'))),
    });
    const result = await resolveStimulusImages([stimulus()], d);
    expect(result.src['stim-1']).toBe(driveImageUrl('drive-1'));
  });

  it('names a stimulus no route could load, and prints nothing for it', async () => {
    const d = deps({
      downloadAsBlob: vi.fn(() => Promise.resolve(null)),
      preload: vi.fn(() => Promise.resolve(false)),
    });
    const result = await resolveStimulusImages([stimulus()], d);

    expect(result.src).toEqual({});
    expect(result.failed.map((s) => s.id)).toEqual(['stim-1']);
  });

  it('names failures in the order the teacher listed them', async () => {
    const d = deps({
      downloadAsBlob: vi.fn(() => Promise.resolve(null)),
      preload: vi.fn(() => Promise.resolve(false)),
    });
    const result = await resolveStimulusImages(
      [
        stimulus({ id: 'a', label: 'First' }),
        stimulus({ id: 'b', label: 'Second' }),
        stimulus({ id: 'c', label: 'Third' }),
      ],
      d
    );
    expect(result.failed.map((s) => s.label)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('leaves templates alone — they are drawn, not fetched', async () => {
    const d = deps();
    const result = await resolveStimulusImages(
      [
        stimulus({
          id: 'tmpl',
          source: 'template',
          driveFileId: undefined,
          template: { kind: 'lined', heightMm: 60 },
        }),
      ],
      d
    );

    expect(d.downloadAsBlob).not.toHaveBeenCalled();
    expect(result.src).toEqual({});
    expect(result.failed).toEqual([]);
  });

  it('uses a bare url when there is no Drive file behind it', async () => {
    const d = deps();
    const result = await resolveStimulusImages(
      [stimulus({ driveFileId: undefined, url: 'https://example.test/a.png' })],
      d
    );
    expect(d.downloadAsBlob).not.toHaveBeenCalled();
    expect(result.src['stim-1']).toBe('https://example.test/a.png');
  });

  it('frees every object URL it made, once', async () => {
    const d = deps();
    const result = await resolveStimulusImages(
      [stimulus({ id: 'a' }), stimulus({ id: 'b' })],
      d
    );
    result.release();
    result.release();
    expect(d.revokeObjectUrl).toHaveBeenCalledTimes(2);
  });
});

describe('stimulusLoadErrorMessage', () => {
  it('names what failed, singular and plural', () => {
    expect(
      stimulusLoadErrorMessage([stimulus({ label: 'Unit 3 graph' })])
    ).toBe('Couldn\'t load "Unit 3 graph" — is it still in your Drive?');
    expect(
      stimulusLoadErrorMessage([
        stimulus({ label: 'One' }),
        stimulus({ label: 'Two' }),
      ])
    ).toBe('Couldn\'t load "One", "Two" — are they still in your Drive?');
  });
});
