import { describe, expect, it, vi } from 'vitest';
import type { PaperSheetStimulus } from '@/types';
import {
  findUnsharedSheetImages,
  shareSheetImages,
  shareSheetImagesPrompt,
  sheetImageFileIds,
} from './paperSheetStimulusSharing';

const stim = (over: Partial<PaperSheetStimulus> = {}): PaperSheetStimulus => ({
  id: 'a',
  label: 'Unit 3 graph',
  source: 'image',
  driveFileId: 'drive-a',
  ...over,
});

describe('sheetImageFileIds', () => {
  it('names each Drive file once, and skips what is not one', () => {
    expect(
      sheetImageFileIds([
        stim({ id: 'a', driveFileId: 'f1' }),
        stim({ id: 'b', driveFileId: 'f1' }),
        stim({ id: 'c', driveFileId: 'f2' }),
        stim({ id: 'd', driveFileId: undefined, url: 'https://x.test/a.png' }),
        stim({
          id: 'e',
          source: 'template',
          driveFileId: undefined,
          template: { kind: 'lined', heightMm: 40 },
        }),
      ])
    ).toEqual(['f1', 'f2']);
  });
});

describe('findUnsharedSheetImages', () => {
  it('names only the ones a teammate could not open', async () => {
    const shared = new Set(['f1']);
    const found = await findUnsharedSheetImages(
      [
        stim({ id: 'a', label: 'Shared', driveFileId: 'f1' }),
        stim({ id: 'b', label: 'Private', driveFileId: 'f2' }),
      ],
      (fileId) => Promise.resolve(shared.has(fileId))
    );
    expect(found.map((s) => s.label)).toEqual(['Private']);
  });

  it('asks Drive once per file even when two stimuli share it', async () => {
    const isLinkShared = vi.fn(() => Promise.resolve(false));
    const found = await findUnsharedSheetImages(
      [
        stim({ id: 'a', driveFileId: 'f1' }),
        stim({ id: 'b', driveFileId: 'f1' }),
      ],
      isLinkShared
    );
    expect(isLinkShared).toHaveBeenCalledTimes(1);
    expect(found.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('says nothing about a file whose permissions it could not read', async () => {
    // Guessing "unshared" here would nag the teacher into re-sharing a file
    // that is already fine, every single print.
    const found = await findUnsharedSheetImages([stim()], () =>
      Promise.reject(new Error('403'))
    );
    expect(found).toEqual([]);
  });

  it('leaves templates and bare URLs alone', async () => {
    const found = await findUnsharedSheetImages(
      [
        stim({ id: 'u', driveFileId: undefined, url: 'https://x.test/a.png' }),
        stim({
          id: 't',
          source: 'template',
          driveFileId: undefined,
          template: { kind: 'blank-box', heightMm: 40 },
        }),
      ],
      () => Promise.resolve(false)
    );
    expect(found).toEqual([]);
  });
});

describe('shareSheetImagesPrompt', () => {
  it('names them, singular and plural', () => {
    expect(shareSheetImagesPrompt([stim({ label: 'Graph' })])).toBe(
      '"Graph" is only visible to you, so it prints as an empty box for anyone else in this PLC.'
    );
    expect(
      shareSheetImagesPrompt([stim({ label: 'One' }), stim({ label: 'Two' })])
    ).toBe(
      '"One", "Two" are only visible to you, so they print as empty boxes for anyone else in this PLC.'
    );
  });
});

describe('shareSheetImages', () => {
  it('shares each file once and reports nothing when Drive agrees', async () => {
    const share = vi.fn(() => Promise.resolve());
    const failed = await shareSheetImages(
      [
        stim({ id: 'a', driveFileId: 'f1' }),
        stim({ id: 'b', driveFileId: 'f1' }),
      ],
      share
    );
    expect(share).toHaveBeenCalledTimes(1);
    expect(failed).toEqual([]);
  });

  it('keeps going past a refusal and names what is still private', async () => {
    const share = vi.fn((fileId: string) =>
      fileId === 'f1' ? Promise.reject(new Error('403')) : Promise.resolve()
    );
    const failed = await shareSheetImages(
      [
        stim({ id: 'a', label: 'Refused', driveFileId: 'f1' }),
        stim({ id: 'b', label: 'Fine', driveFileId: 'f2' }),
      ],
      share
    );
    expect(share).toHaveBeenCalledTimes(2);
    expect(failed.map((s) => s.label)).toEqual(['Refused']);
  });
});
