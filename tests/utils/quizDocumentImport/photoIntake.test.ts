import { describe, it, expect, vi } from 'vitest';
import { heicTo } from 'heic-to/csp';
import {
  HEIC_UNREADABLE,
  decodeIfHeic,
  looksLikeAnswerKey,
  looksLikeKeyName,
  looksLikeKeyText,
  naturalCompare,
} from '@/utils/quizDocumentImport/uploadIntake';
import {
  documentKind,
  isHeicFile,
  readQuizDocument,
} from '@/utils/quizDocumentImport';
import { browserImageDeps } from '@/utils/quizDocumentImport/imageBrowserDeps';
import type { RasterizedPage } from '@/utils/paperScanRaster';

vi.mock('heic-to/csp', () => ({
  heicTo: vi.fn(() => Promise.reject(new Error('bad heic'))),
}));

const photo = (name: string, type = 'image/jpeg') =>
  new File([new Uint8Array([1])], name, { type });

describe('photos as a document kind (R15)', () => {
  it('knows JPG, PNG and HEIC photos by type or name', () => {
    expect(documentKind(photo('p.jpg'))).toBe('image');
    expect(documentKind(photo('p.png', 'image/png'))).toBe('image');
    expect(documentKind(photo('IMG_1.HEIC', ''))).toBe('image');
    expect(documentKind(photo('scan', 'image/heif'))).toBe('image');
    expect(documentKind(photo('p.gif', 'image/gif'))).toBeNull();
  });

  it('tells an iPhone photo apart', () => {
    expect(isHeicFile(photo('IMG_1.heic', ''))).toBe(true);
    expect(isHeicFile(photo('p.jpg'))).toBe(false);
  });
});

describe('does this file look like an answer key (R16)', () => {
  it('goes by the name first', () => {
    expect(looksLikeKeyName('Unit 3 Answer Key.pdf')).toBe(true);
    expect(looksLikeKeyName('scoring_guide.docx')).toBe(true);
    expect(looksLikeKeyName('Unit 3 Test.pdf')).toBe(false);
    // The extension is not part of the name.
    expect(looksLikeKeyName('test.key')).toBe(false);
  });

  it('counts a page that is mostly numbered answers', () => {
    expect(
      looksLikeKeyText(['Unit 3', '1. B', '2. C', '3) a', '4 - True'])
    ).toBe(true);
    expect(looksLikeKeyText(['1. B 2pts', '2. A (p. 4)'])).toBe(true);
  });

  it('does not mistake a test for one', () => {
    expect(
      looksLikeKeyText([
        '1. A plant needs which of these?',
        'a. water',
        'b. rocks',
        '2. Which is a mammal?',
        'a. whale',
      ])
    ).toBe(false);
  });

  it('counts three Correct Answer labels', () => {
    expect(
      looksLikeKeyText([
        'ITEM 1 Correct Answer: c the sun',
        'Some distractor analysis text here',
        'ITEM 2 Correct Answer: a',
        'More text',
        'More text',
        'More text',
        'ITEM 3 Correct Answers: a, b',
      ])
    ).toBe(true);
  });

  it('never throws when the file cannot be opened', async () => {
    await expect(
      looksLikeAnswerKey(new Blob(['x']), 'Unit 3.pdf', () =>
        Promise.reject(new Error('nope'))
      )
    ).resolves.toBe(false);
  });
});

describe('photo order (R30)', () => {
  it('sorts page 2 before page 10', () => {
    expect(
      ['page 10.jpg', 'page 2.jpg', 'Page 1.jpg'].sort(naturalCompare)
    ).toEqual(['Page 1.jpg', 'page 2.jpg', 'page 10.jpg']);
  });
});

describe('decoding an iPhone photo (R30)', () => {
  it('passes other photos through untouched', async () => {
    const jpg = photo('p.jpg');
    await expect(decodeIfHeic(jpg)).resolves.toBe(jpg);
  });

  it('decodes an iPhone photo to JPEG, not PNG', async () => {
    vi.mocked(heicTo).mockResolvedValueOnce(
      new Blob([new Uint8Array([1])], { type: 'image/jpeg' })
    );
    const out = await decodeIfHeic(photo('IMG_1.HEIC', ''));
    expect(vi.mocked(heicTo)).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'image/jpeg', quality: 0.9 })
    );
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_1.jpg');
    expect(documentKind(out)).toBe('image');
  });

  it('says to export as JPEG when the decoder fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(decodeIfHeic(photo('IMG_1.HEIC', ''))).rejects.toThrow(
      HEIC_UNREADABLE
    );
  });
});

describe('reading photos of a test', () => {
  const page = (): RasterizedPage => ({
    pageNumber: 1,
    page: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
    crop: () => '',
  });
  const rasterize = async function* (): AsyncGenerator<RasterizedPage> {
    yield page();
    await Promise.resolve();
  };

  it('reads every photo as a page, in order, by OCR', async () => {
    const texts: Record<string, string> = {
      'p1.jpg': '1. What is 2 + 2?\nA. 3\nB. 4',
      'p2.jpg': '2. Name a planet.\nA. Mars\nB. Moon',
    };
    const photos = [photo('p1.jpg'), photo('p2.jpg')];
    let current = '';
    const pdf = browserImageDeps(photos, {
      rasterize: (file) => {
        current = (file as File).name;
        return rasterize();
      },
      recognize: () => Promise.resolve(texts[current]),
    });
    const quiz = await readQuizDocument(photos[0], {
      fileName: 'p1.jpg',
      pdf,
      pages: photos,
    });
    expect(quiz.questions.map((q) => q.text)).toEqual([
      'What is 2 + 2?',
      'Name a planet.',
    ]);
    expect(quiz.questions[1].options.map((o) => o.text)).toEqual([
      'Mars',
      'Moon',
    ]);
    expect(quiz.warnings.join(' ')).toMatch(/photos were read by eye/);
    expect(quiz.warnings.join(' ')).not.toMatch(/Pictures in a PDF/);
  });

  it('holds photos to the 20-page cap', async () => {
    const photos = Array.from({ length: 21 }, (_, i) => photo(`p${i}.jpg`));
    await expect(
      readQuizDocument(photos[0], {
        fileName: 'p0.jpg',
        pdf: browserImageDeps(photos),
        pages: photos,
      })
    ).rejects.toThrow(/21 pages/);
  });
});
