import { describe, expect, it } from 'vitest';
import type { PaperMarkupItem, WrittenReturnMode } from '@/types';
import { cropViewportMm } from '@/utils/paperMarkupRender';
import { buildFilledSheetHtml } from '@/utils/paperSheetPrint';
import {
  applyPreset,
  RESULTS_PRINT_PRESETS,
} from '@/utils/quizResultsPrintPresets';
import {
  buildResultsPrintHtml,
  RESULTS_PRINT_STYLES,
  writtenSheetFill,
  type PaperWrittenPrint,
  type QuizResultsPrintOptions,
  type ResultsPrintJob,
} from '@/utils/quizStudentReportPrint';
import {
  boxOf,
  fixtureJob,
  markupFor,
  TINY_PNG,
  type FixtureOptions,
} from './fixtures/resultsPrintMarkupFixture';

const feedbackOptions = (
  over: Partial<QuizResultsPrintOptions> = {}
): QuizResultsPrintOptions => ({ ...applyPreset('graded-copy'), ...over });

const paperBlock = (html: string) =>
  dom(html).querySelector('[data-student="paper-1"].stu') as HTMLElement;

const dom = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
};

const marked = (over: FixtureOptions = {}): ResultsPrintJob =>
  fixtureJob({ markup: { w1: markupFor() }, imageMarkup: true, ...over });

const build = (job: ResultsPrintJob, options = feedbackOptions()) =>
  buildResultsPrintHtml(job, options);

const patchPaper = (
  job: ResultsPrintJob,
  patch: (current: PaperWrittenPrint) => PaperWrittenPrint
) => {
  const student = job.students[0];
  const current = student.paperWritten?.w1;
  if (!current) throw new Error('fixture');
  student.paperWritten = { ...student.paperWritten, w1: patch(current) };
};

const withMode = (job: ResultsPrintJob, mode: WrittenReturnMode) => ({
  ...job,
  writtenMode: mode,
});

const longComment = 'word '.repeat(100).trim();

describe('flag off, or nothing marked: the print is exactly what it was', () => {
  for (const preset of RESULTS_PRINT_PRESETS) {
    for (const layout of [undefined, 'both'] as const) {
      const options = {
        ...preset.options,
        ...(layout ? { layout } : {}),
      };
      const label = `${preset.id}${layout ? ` (${layout})` : ''}`;

      it(`${label}: markup on the grades but no flag changes nothing`, () => {
        const plain = build(fixtureJob(), options);
        const withItems = build(
          fixtureJob({ markup: { w1: markupFor() } }),
          options
        );
        expect(withItems).toBe(plain);
      });

      it(`${label}: the flag with no markup on any grade changes nothing`, () => {
        expect(build(fixtureJob({ imageMarkup: true }), options)).toBe(
          build(fixtureJob(), options)
        );
      });

      it(`${label}: an empty markup list changes nothing`, () => {
        expect(
          build(fixtureJob({ markup: { w1: [] }, imageMarkup: true }), options)
        ).toBe(build(fixtureJob(), options));
      });
    }
  }

  it('prints no markup when the written feedback is off, even with the flag', () => {
    for (const preset of RESULTS_PRINT_PRESETS) {
      if (preset.options.showWrittenFeedback) continue;
      expect(build(marked(), preset.options)).toBe(
        build(fixtureJob(), preset.options)
      );
    }
  });
});

describe('markup in the report layout', () => {
  const html = paperBlock(build(marked()));
  const item = html.querySelectorAll('ol.q > li')[1];

  it('wraps the handwriting with an overlay over the crop’s own millimetres', () => {
    const wrap = item.querySelector('.hw-mk');
    expect(wrap?.querySelector('img.hw')?.getAttribute('src')).toBe(TINY_PNG);
    const v = cropViewportMm(boxOf('w1'));
    expect(wrap?.querySelector('svg')?.getAttribute('viewBox')).toBe(
      `${v.x} ${v.y} ${v.w} ${v.h}`
    );
    expect(wrap?.querySelector('svg')?.getAttribute('style')).toContain(
      'width:100%'
    );
  });

  it('lets the wrapper hug the image, so the overlay scales with it', () => {
    const style = item.querySelector('.hw-mk')?.getAttribute('style') ?? '';
    expect(style).toContain('position:relative');
    expect(style).toContain('width:fit-content');
    expect(style).toContain('max-width:100%');
  });

  it('prints the numbered comments under the answer, matching the pins', () => {
    const rows = [...item.querySelectorAll('.hw-mk + ol.notes > li')];
    expect(rows.map((li) => li.textContent)).toEqual([
      '1Key claim',
      '2Cite the text.',
    ]);
    expect(
      [...item.querySelectorAll('.hw-mk svg text')].map((t) => t.textContent)
    ).toEqual(['1', '2']);
  });

  it('keeps the image and its list in one unbreakable answer', () => {
    expect(item.matches('li')).toBe(true);
    expect(buildResultsPrintHtml(marked(), feedbackOptions())).toContain(
      'class="hw-mk"'
    );
    expect(item.parentElement?.className).toBe('q');
    expect(RESULTS_PRINT_STYLES).toMatch(/ol\.q > li \{ break-inside: avoid/);
  });

  it('numbers each answer from 1', () => {
    const two = paperBlock(
      build(
        fixtureJob({
          markup: {
            w1: markupFor(),
            w2: [
              {
                id: 'q',
                kind: 'pin',
                atMm: { x: boxOf('w2').x + 5, y: boxOf('w2').y + 5 },
                comment: 'Second answer',
              },
            ],
          },
          imageMarkup: true,
        })
      )
    );
    const lists = [...two.querySelectorAll('ol.notes')].map((ol) =>
      [...ol.querySelectorAll('li')].map((li) => li.textContent)
    );
    expect(lists).toEqual([
      ['1Key claim', '2Cite the text.'],
      ['1Second answer'],
    ]);
  });

  it('leaves the other answers and students alone', () => {
    expect(html.querySelectorAll('.hw-mk')).toHaveLength(1);
    expect(html.querySelectorAll('img.hw')).toHaveLength(2);
  });

  it('matches the snapshot for each preset that prints feedback', () => {
    for (const preset of RESULTS_PRINT_PRESETS) {
      if (!preset.options.showWrittenFeedback) continue;
      expect(build(marked(), preset.options)).toMatchSnapshot(preset.id);
    }
  });
});

describe('markup follows the handwriting / typed / both setting (K14)', () => {
  const answerOf = (h: string) =>
    paperBlock(h).querySelectorAll('ol.q > li')[1];

  it('handwriting: pins on the image, list under it, no typed text', () => {
    const li = answerOf(build(withMode(marked(), 'handwriting')));
    expect(li.querySelector('.hw-mk svg')).not.toBeNull();
    expect(li.querySelectorAll('ol.notes li')).toHaveLength(2);
    expect(li.querySelector('.written')).toBeNull();
  });

  it('typed: no image, no pins, but the comments still print as a labelled list', () => {
    const li = answerOf(build(withMode(marked(), 'typed')));
    expect(li.querySelector('img')).toBeNull();
    expect(li.querySelector('svg')).toBeNull();
    expect(li.textContent).toContain('Comments on the handwriting');
    expect(
      [...li.querySelectorAll('ol.notes li')].map((l) => l.textContent)
    ).toEqual(['1Key claim', '2Cite the text.']);
    expect(li.querySelector('.written')?.textContent).toBe(
      'Plants need light to make food'
    );
  });

  it('both: image, then its comments, then the typed answer', () => {
    const li = answerOf(build(withMode(marked(), 'both')));
    const body = li.querySelector('div:not(.text)');
    const order = [...(body?.children ?? [])].map((el) => el.className);
    expect(order.slice(1, 4)).toEqual(['hw-mk', 'notes', 'written']);
  });

  it('draws text highlights on the typed answer next to image markup', () => {
    const li = answerOf(build(withMode(marked({ annotate: true }), 'both')));
    expect(li.querySelector('.hw-mk svg')).not.toBeNull();
    expect(li.querySelector('.written mark')).not.toBeNull();
    const lists = [...li.querySelectorAll('ol.notes')].map(
      (ol) => ol.textContent
    );
    expect(lists).toHaveLength(2);
    expect(lists[0]).toContain('Key claim');
    expect(lists[1]).toBe('Which plants?');
  });

  it('keeps both lists when the handwriting is all that shows', () => {
    const li = answerOf(
      build(withMode(marked({ annotate: true }), 'handwriting'))
    );
    const lists = [...li.querySelectorAll('ol.notes')].map(
      (ol) => ol.textContent
    );
    expect(lists).toHaveLength(2);
    expect(lists[0]).toContain('Cite the text.');
    expect(lists[1]).toBe('Which plants?');
  });

  it('keeps the comments when the crop failed to load, without pins', () => {
    for (const cropSrc of [null, undefined]) {
      const job = withMode(marked(), 'handwriting');
      patchPaper(job, (p) => ({
        answer: p.answer,
        ...(cropSrc === null ? { cropSrc } : {}),
      }));
      const li = answerOf(build(job));
      expect(li.querySelector('svg')).toBeNull();
      expect(li.querySelector('.hw-missing')).not.toBeNull();
      expect(li.querySelectorAll('ol.notes li')).toHaveLength(2);
    }
  });

  it('keeps the image and the comments, without pins, when the sheet’s page map is gone', () => {
    const job = withMode(marked(), 'handwriting');
    job.students[0].sheet = undefined;
    const li = answerOf(build(job));
    expect(li.querySelector('img.hw')).not.toBeNull();
    expect(li.querySelector('svg')).toBeNull();
    expect(li.querySelector('.hw-mk')).toBeNull();
    expect(li.querySelectorAll('ol.notes li')).toHaveLength(2);
  });

  it('says a transcript is still coming below the image and its comments', () => {
    const job = withMode(marked(), 'both');
    patchPaper(job, (p) => ({
      ...p,
      answer: { ...p.answer, paperTranscript: 'pending' },
    }));
    const li = answerOf(build(job));
    expect(li.querySelector('.hw-mk svg')).not.toBeNull();
    expect(li.textContent).toContain('Transcribing');
  });
});

describe('comment text in the print', () => {
  const evil = '<script>alert(1)</script> "x" & <b>bold</b>';
  const job = fixtureJob({
    markup: {
      w1: [
        {
          id: 'p',
          kind: 'pin',
          atMm: { x: boxOf('w1').x + 20, y: boxOf('w1').y + 20 },
          comment: evil,
        },
      ],
    },
    imageMarkup: true,
  });

  it('is escaped in the report', () => {
    const html = build(job);
    const root = paperBlock(html);
    expect(dom(html).querySelector('script')).toBeNull();
    expect(root.querySelector('.hw-mk ~ ol.notes b')).toBeNull();
    expect(root.querySelector('.hw-mk + ol.notes li')?.textContent).toContain(
      evil
    );
  });

  it('is escaped in the sheet strip', () => {
    const html = build(job, feedbackOptions({ layout: 'sheet' }));
    const root = dom(html);
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('.wr-comment b')).toBeNull();
    expect(root.querySelector('.wr-comment')?.textContent).toContain(evil);
  });
});

describe('markup on the redrawn sheet', () => {
  const sheetOptions = feedbackOptions({ layout: 'sheet' });
  const sheet = (job: ResultsPrintJob, options = sheetOptions) =>
    dom(build(job, options));
  const px = (el: Element | null, prop: string) =>
    parseFloat(
      (el as HTMLElement | null)?.style.getPropertyValue(prop) ?? 'NaN'
    );

  it('draws the markup over the crop inside its box, in the crop’s own millimetres', () => {
    const root = sheet(marked());
    const wrap = root.querySelector('.wr-mk');
    const box = boxOf('w1');
    const v = cropViewportMm(box);
    expect(wrap?.querySelector('svg')?.getAttribute('viewBox')).toBe(
      `${v.x} ${v.y} ${v.w} ${v.h}`
    );
    expect(wrap?.querySelector('img.wr-crop')?.getAttribute('src')).toBe(
      TINY_PNG
    );
    // Same aspect as the crop, left and top on the box, never past it.
    const w = px(wrap, 'width');
    const h = px(wrap, 'height');
    expect(px(wrap, 'left')).toBeCloseTo(box.x, 2);
    expect(px(wrap, 'top')).toBeCloseTo(box.y, 2);
    expect(w / h).toBeCloseTo(v.w / v.h, 2);
    expect(w).toBeLessThanOrEqual(box.w + 1e-6);
  });

  it('joins the numbered comments to the strip, after the teacher’s own', () => {
    const strip = sheet(marked()).querySelector('.wr-comment');
    expect(strip?.textContent).toBe(
      'Overall note for w1 1Key claim 2Cite the text.'
    );
  });

  it('grows the strip as comments need and shrinks the crop, never past the box', () => {
    const root = sheet(marked());
    const box = boxOf('w1');
    const strip = root.querySelector('.wr-comment');
    const wrap = root.querySelector('.wr-mk');
    const stripTop = px(strip, 'top');
    expect(stripTop + px(strip, 'height')).toBeLessThanOrEqual(
      box.y + box.h + 1e-6
    );
    expect(px(wrap, 'top') + px(wrap, 'height')).toBeLessThanOrEqual(
      stripTop + 1e-6
    );
    expect(px(strip, 'height')).toBeLessThanOrEqual(box.h * 0.45);
  });

  it('cuts the last comments and counts them when they do not fit', () => {
    const many: PaperMarkupItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: `m${i}`,
      kind: 'pin',
      atMm: { x: boxOf('w1').x + 10 + i * 3, y: boxOf('w1').y + 20 },
      comment: `Comment number ${i + 1} about this part`,
    }));
    const root = sheet(fixtureJob({ markup: { w1: many }, imageMarkup: true }));
    const strip = root.querySelector('.wr-comment') as HTMLElement;
    const box = boxOf('w1');
    expect(strip.textContent).toMatch(/\+\d+ more$/);
    expect(strip.textContent).not.toContain('see the report');
    expect(px(strip, 'height')).toBeLessThanOrEqual(box.h * 0.45);
    const lines = parseInt(
      strip.style.getPropertyValue('-webkit-line-clamp'),
      10
    );
    expect(lines).toBeLessThanOrEqual(6);
    expect(px(strip, 'height')).toBeCloseTo(lines * 3.6 + 0.9, 2);
    // Every pin is still on the crop, even where its comment is cut.
    expect(root.querySelectorAll('.wr-mk svg text')).toHaveLength(30);
  });

  it('points to the report when the report prints too', () => {
    const many: PaperMarkupItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: `m${i}`,
      kind: 'pin',
      atMm: { x: boxOf('w1').x + 10 + i * 3, y: boxOf('w1').y + 20 },
      comment: `Comment number ${i + 1} about this part`,
    }));
    const root = sheet(
      fixtureJob({ markup: { w1: many }, imageMarkup: true }),
      feedbackOptions({ layout: 'both' })
    );
    expect(root.querySelector('.wr-comment')?.textContent).toMatch(
      /\+\d+ more, see the report$/
    );
    // The report, in the same print, lists all 30.
    const report = root.querySelector('[data-student="paper-1"].stu');
    expect(report?.querySelectorAll('ol.notes li')).toHaveLength(30);
  });

  it('cuts a single long comment at a word with an ellipsis, inside a small box', () => {
    const small = boxOf('w2');
    const root = sheet(
      fixtureJob({
        markup: {
          w2: [
            {
              id: 'p',
              kind: 'pin',
              atMm: { x: small.x + 10, y: small.y + 10 },
              comment: longComment,
            },
          ],
        },
        imageMarkup: true,
      })
    );
    const strips = root.querySelectorAll('.wr-comment');
    const strip = strips[strips.length - 1] as HTMLElement;
    expect(strip.textContent?.endsWith('…')).toBe(true);
    expect(strip.textContent?.length).toBeLessThan(longComment.length);
    expect(px(strip, 'height')).toBeLessThanOrEqual(small.h * 0.45);
    expect(px(strip, 'top') + px(strip, 'height')).toBeLessThanOrEqual(
      small.y + small.h + 1e-6
    );
  });

  it('keeps a long teacher comment from pushing the numbered ones out', () => {
    const root = sheet(marked({ overallComment: longComment }));
    const strip = root.querySelector('.wr-comment');
    expect(strip?.textContent).toContain('1Key claim');
    expect(strip?.textContent).toContain('…');
  });

  it('numbers comments without a crop, leaving the placeholder in the box', () => {
    const job = marked();
    patchPaper(job, (p) => ({ ...p, cropSrc: null }));
    const root = sheet(job);
    expect(root.querySelector('.wr-mk')).toBeNull();
    expect(root.querySelector('.wr-missing')?.textContent).toBe(
      'Handwriting unavailable'
    );
    expect(root.querySelector('.wr-comment')?.textContent).toContain(
      '1Key claim'
    );
  });

  it('prints no markup without the flag or with the feedback off', () => {
    expect(
      sheet(fixtureJob({ markup: { w1: markupFor() } })).querySelector('.wr-mk')
    ).toBeNull();
    expect(
      sheet(
        marked(),
        feedbackOptions({ layout: 'sheet', showWrittenFeedback: false })
      ).querySelector('.wr-mk')
    ).toBeNull();
  });

  it('builds the fill with the items, and flags the report only when it prints', () => {
    const job = marked();
    const student = job.students[0];
    const reprint = student.sheet;
    if (!reprint) throw new Error('fixture');
    const on = {
      markAnswers: true,
      showWrittenFeedback: true,
      imageMarkup: true,
    };
    expect(writtenSheetFill(student, reprint, on)?.w1.markup).toHaveLength(4);
    expect(
      writtenSheetFill(student, reprint, on)?.w1.markupInReport
    ).toBeUndefined();
    expect(
      writtenSheetFill(student, reprint, { ...on, layout: 'both' })?.w1
        .markupInReport
    ).toBe(true);
    expect(
      writtenSheetFill(student, reprint, { ...on, imageMarkup: false })?.w1
        .markup
    ).toBeUndefined();
    expect(
      writtenSheetFill(student, reprint, { ...on, showWrittenFeedback: false })
        ?.w1.markup
    ).toBeUndefined();
  });

  it('draws the same crop and strip as before when there is no markup', () => {
    const plain = buildFilledSheetHtml(
      {
        seat: 7,
        student: null,
        displayName: 'Sam',
        className: '',
        isKeySheet: false,
      },
      {
        batchId: 'b',
        quizTitle: 'T',
        questionCount: 2,
        choiceCount: 4,
        columnsPerPage: 2,
        pageMaps: fixtureJob().students[0].sheet?.pageMaps,
        writtenTexts: { w1: 'x' },
      },
      1,
      {
        filled: [],
        key: [],
        marks: [],
        written: { w1: { crop: TINY_PNG, comment: 'Note' } },
      }
    );
    const root = dom(plain);
    expect(root.querySelector('.wr-mk')).toBeNull();
    expect(root.querySelector('img.wr-crop')?.getAttribute('style')).toContain(
      `left:${boxOf('w1').x.toFixed(3)}mm`
    );
    expect(px(root.querySelector('.wr-comment'), 'height')).toBeCloseTo(8, 3);
  });
});
