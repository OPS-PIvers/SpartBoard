import { describe, expect, it } from 'vitest';
import {
  pagesToGuidedLearningSet,
  splitSlideText,
} from './slidesToGuidedLearning';
import {
  createGuidedLearningImportAdapter,
  validateGuidedLearningImport,
} from './guidedLearningImportAdapter';
import type { PageImage } from '@/utils/import/pageImages';

const page = (text: string): PageImage => ({
  blob: new Blob(['img'], { type: 'image/webp' }),
  width: 1920,
  height: 1080,
  text,
});

describe('slides to Guided Learning', () => {
  it('splits a slide title from its body', () => {
    expect(splitSlideText('Mitosis\nPhase one\nPhase two')).toEqual({
      label: 'Mitosis',
      body: 'Phase one\nPhase two',
    });
    expect(splitSlideText('')).toEqual({});
    const long = 'word '.repeat(40).trim();
    expect(splitSlideText(long)).toEqual({ body: long });
  });

  it('makes one slide and one hidden-hotspot step per page that passes import checks', async () => {
    const set = await pagesToGuidedLearningSet('Cells', [
      page('Cells\nThe unit of life'),
      page(''),
    ]);
    expect(set.imageUrls).toHaveLength(2);
    expect(set.imageUrls[0]).toMatch(/^data:image\/webp;base64,/);
    expect(set.steps.map((s) => [s.imageIndex, s.label, s.text])).toEqual([
      [0, 'Cells', 'The unit of life'],
      [1, undefined, undefined],
    ]);
    expect(set.steps.every((s) => s.hotspotAlwaysHidden)).toBe(true);
    expect(validateGuidedLearningImport(set)).toEqual({ ok: true, errors: [] });
  });

  it('takes PDFs only when slide import is switched on', async () => {
    const off = createGuidedLearningImportAdapter({
      save: () => Promise.resolve(),
      renderPreview: () => null,
    });
    expect(off.extraUpload).toBeUndefined();

    const on = createGuidedLearningImportAdapter({
      save: () => Promise.resolve(),
      renderPreview: () => null,
      readPages: () =>
        Promise.resolve({ pages: [page('Cells')], warnings: [], pageCount: 1 }),
    });
    expect(on.extraUpload?.accept).toBe('.pdf,.pptx');
    const result = await on.parse({
      kind: 'file',
      file: new File(['%PDF'], 'Cell Unit.pdf'),
    });
    expect(result.data.title).toBe('Cell Unit');
    expect(result.data.steps).toHaveLength(1);
  });
});
