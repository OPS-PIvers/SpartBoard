import { describe, expect, it } from 'vitest';
import { RESULTS_PRINT_PRESETS } from '@/utils/quizResultsPrintPresets';
import {
  buildResultsPreviewDocument,
  buildResultsPrintHtml,
  RESULTS_PRINT_STYLES,
  type QuizResultsPrintOptions,
} from '@/utils/quizStudentReportPrint';
import { printedPageOf } from '@/utils/paperSheetReprint';
import { fixtureJob } from './fixtures/resultsPrintMarkupFixture';
import { PAGE_SRC, scanJob, scanMarkup } from './fixtures/scanSheetFixture';

const sheet = (id: string): QuizResultsPrintOptions => {
  const preset = RESULTS_PRINT_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(id);
  return { ...preset.options, layout: 'sheet' };
};

const scanPages = (html: string) =>
  Array.from(html.matchAll(/data-scan-page="(\d+)"/g)).map((m) => Number(m[1]));
const redrawnPages = (html: string) =>
  html.split('<div class="sheet">').length - 1;

describe('results print on kept scan pages', () => {
  for (const preset of RESULTS_PRINT_PRESETS) {
    it(`${preset.id} prints on the kept pages`, () => {
      const job = scanJob(
        { imageMarkup: true, markup: { w1: scanMarkup() } },
        { 1: PAGE_SRC, 2: PAGE_SRC }
      );
      expect(
        buildResultsPrintHtml(job, { ...preset.options, layout: 'sheet' })
      ).toMatchSnapshot();
    });
    it(`${preset.id} with the report after the kept pages`, () => {
      const job = scanJob(
        { imageMarkup: true, markup: { w1: scanMarkup() } },
        { 1: PAGE_SRC, 2: PAGE_SRC }
      );
      expect(
        buildResultsPrintHtml(job, { ...preset.options, layout: 'both' })
      ).toMatchSnapshot();
    });
  }

  it('prints exactly as before without kept pages, or when none loaded', () => {
    for (const preset of RESULTS_PRINT_PRESETS) {
      for (const layout of ['sheet', 'both', 'report'] as const) {
        const options = { ...preset.options, layout };
        const before = buildResultsPrintHtml(scanJob(), options);
        expect(
          buildResultsPrintHtml(scanJob({}, { 1: null, 2: null }), options)
        ).toBe(before);
        expect(buildResultsPrintHtml(scanJob({}, {}), options)).toBe(before);
        expect(before).not.toContain('scan-sheet');
      }
    }
  });

  it('leaves the existing fixture byte-identical and its styles unchanged', () => {
    const body = buildResultsPrintHtml(fixtureJob(), sheet('bubble-sheet'));
    expect(body).not.toContain('scan-sheet');
    expect(buildResultsPreviewDocument(body)).not.toContain('.scan-sheet');
    expect(RESULTS_PRINT_STYLES).not.toContain('scan-');
  });

  it('adds the scan styles only to a document that prints a scan', () => {
    const body = buildResultsPrintHtml(
      scanJob({}, { 1: PAGE_SRC }),
      sheet('graded-copy')
    );
    expect(buildResultsPreviewDocument(body)).toContain(
      '.scan-sheet .scan-img'
    );
  });

  it('prints the report layout alone with no scan, kept pages or not', () => {
    const options = { ...sheet('graded-copy'), layout: 'report' as const };
    expect(
      buildResultsPrintHtml(scanJob({}, { 1: PAGE_SRC, 2: PAGE_SRC }), options)
    ).toBe(buildResultsPrintHtml(scanJob(), options));
  });

  it('falls back to the redrawn sheet for a page with no kept scan (K8)', () => {
    const html = buildResultsPrintHtml(
      scanJob({}, { 1: PAGE_SRC, 2: null }),
      sheet('graded-copy')
    );
    expect(scanPages(html)).toEqual([1]);
    expect(redrawnPages(html)).toBe(1);
    // The redrawn page stays the second one, and the set still counts two pages for duplex.
    expect(html.indexOf('data-scan-page="1"')).toBeLessThan(
      html.indexOf('<div class="sheet">')
    );
    expect(html).toContain('data-pages="2"');
    const only2 = buildResultsPrintHtml(
      scanJob({}, { 2: PAGE_SRC }),
      sheet('graded-copy')
    );
    expect(scanPages(only2)).toEqual([2]);
    expect(only2.indexOf('<div class="sheet">')).toBeLessThan(
      only2.indexOf('data-scan-page="2"')
    );
  });

  it('files kept pages under the printed page number when prompt pages were left out', () => {
    const job = scanJob({ promptPage: true }, { 1: PAGE_SRC, 3: PAGE_SRC });
    const reprint = job.students[0].sheet;
    expect(reprint?.printedPages).toEqual([1, 3]);
    expect(reprint && [0, 1].map((i) => printedPageOf(reprint, i))).toEqual([
      1, 3,
    ]);
    const html = buildResultsPrintHtml(job, sheet('graded-copy'));
    expect(scanPages(html)).toEqual([1, 3]);
    expect(redrawnPages(html)).toBe(0);
    // The second kept page carries w2's box: its points sit beside it.
    const second = html.slice(html.indexOf('data-scan-page="3"'));
    expect(second).toContain('2/4');
    expect(second).toContain('Name each step.');
  });

  it('never prints the prompt page itself, even when it was kept', () => {
    const html = buildResultsPrintHtml(
      scanJob({ promptPage: true }, { 2: PAGE_SRC }),
      sheet('graded-copy')
    );
    expect(scanPages(html)).toEqual([]);
    expect(redrawnPages(html)).toBe(2);
  });

  it('a batch without prompt pages records no printed numbers', () => {
    expect(scanJob().students[0].sheet?.printedPages).toBeUndefined();
  });

  it('missed only keeps points on missed answers and drops them on full marks', () => {
    const options = { ...sheet('missed-only') };
    const partial = buildResultsPrintHtml(
      scanJob({}, { 1: PAGE_SRC }),
      options
    );
    expect(partial.slice(partial.indexOf('scan-fb'))).toContain('3/4');
    const full = buildResultsPrintHtml(
      scanJob({ w1Points: 4 }, { 1: PAGE_SRC }),
      options
    );
    const page1 = full.slice(
      full.indexOf('data-scan-page="1"'),
      full.indexOf('<div class="sheet">')
    );
    expect(page1).not.toContain('4/4');
    // The comment is feedback, so it still prints.
    expect(page1).toContain('Good start. Say where the energy goes.');
  });

  it('draws image markup on the page only with the markup flag and feedback on', () => {
    const markup = { w1: scanMarkup() };
    const on = buildResultsPrintHtml(
      scanJob({ imageMarkup: true, markup }, { 1: PAGE_SRC }),
      sheet('graded-copy')
    );
    expect(on).toContain('Which gas do plants take in?');
    expect(on.match(/viewBox="0 0 215\.9 279\.4"/g)?.length).toBe(2);
    const flagOff = buildResultsPrintHtml(
      scanJob({ markup }, { 1: PAGE_SRC }),
      sheet('graded-copy')
    );
    expect(flagOff).not.toContain('Which gas do plants take in?');
    const feedbackOff = buildResultsPrintHtml(
      scanJob({ imageMarkup: true, markup }, { 1: PAGE_SRC }),
      { ...sheet('graded-copy'), showWrittenFeedback: false }
    );
    expect(feedbackOff).not.toContain('Which gas do plants take in?');
    expect(feedbackOff).not.toContain('Good start.');
  });

  it('places markup in page millimetres, the same numbers the editor stored', () => {
    const items = scanMarkup();
    const html = buildResultsPrintHtml(
      scanJob({ imageMarkup: true, markup: { w1: items } }, { 1: PAGE_SRC }),
      sheet('graded-copy')
    );
    const h = items[0];
    if (h.kind !== 'highlight') throw new Error('fixture');
    expect(html).toContain(
      `<rect x="${h.rectMm.x}" y="${h.rectMm.y}" width="${h.rectMm.w}"`
    );
  });
});
