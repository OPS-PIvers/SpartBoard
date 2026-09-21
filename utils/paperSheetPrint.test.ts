import { describe, expect, it, vi } from 'vitest';
import type { PaperSheetStimulus } from '@/types';
import {
  BUBBLE_LETTER_GREY,
  COLUMN_X_MM,
  MARKER_CELL_COUNT,
  MIN_BUBBLE_LETTER_GREY,
  QUESTIONS_PER_PAGE,
  ROWS_PER_COLUMN,
  STIMULUS_RECT_MM,
  markerCellRectMm,
} from './paperSheetLayout';
import { decodePaperMarker, paperBatchTag } from './paperSheetMarker';
import type { PaperSheetPlan } from './paperSheetPlan';
import {
  buildPaperSheetsHtml,
  printPaperSheets,
  type PaperPrintJob,
} from './paperSheetPrint';

const sheet = (over: Partial<PaperSheetPlan> = {}): PaperSheetPlan => ({
  seat: 1,
  student: { rosterId: 'r1', studentId: 's1' },
  displayName: 'Alvarez, Sam',
  className: 'Period 1',
  isKeySheet: false,
  ...over,
});

const job = (over: Partial<PaperPrintJob> = {}): PaperPrintJob => ({
  batchId: 'batch-1',
  quizTitle: 'Unit 3 Test',
  questionCount: 10,
  choiceCount: 4,
  sheets: [sheet()],
  ...over,
});

/** Recover the marker cells a rendered page drew, in grid order. */
const readMarker = (pageHtml: string): boolean[] => {
  const inked = new Set(
    [
      ...pageHtml.matchAll(
        /<div class="cell" style="left:([\d.]+)mm;top:([\d.]+)mm/g
      ),
    ].map((m) => `${m[1]},${m[2]}`)
  );
  return Array.from({ length: MARKER_CELL_COUNT }, (_, i) => {
    const r = markerCellRectMm(i);
    return inked.has(`${r.x.toFixed(3)},${r.y.toFixed(3)}`);
  });
};

const pages = (html: string): string[] =>
  html.split('<div class="sheet">').slice(1);

describe('buildPaperSheetsHtml', () => {
  it('prints a marker that decodes back to the seat and page it was drawn for', () => {
    const html = buildPaperSheetsHtml(
      job({ questionCount: 60, sheets: [sheet({ seat: 42 })] })
    );
    const [page1, page2] = pages(html);
    expect(decodePaperMarker(readMarker(page1))).toEqual({
      batchTag: paperBatchTag('batch-1'),
      seat: 42,
      page: 1,
      isKeySheet: false,
    });
    expect(decodePaperMarker(readMarker(page2))).toMatchObject({
      seat: 42,
      page: 2,
    });
  });

  it('flags the answer key in its marker, not just its header', () => {
    const html = buildPaperSheetsHtml(
      job({
        sheets: [
          sheet({ seat: 9, isKeySheet: true, displayName: 'ANSWER KEY' }),
        ],
      })
    );
    expect(decodePaperMarker(readMarker(pages(html)[0]))).toMatchObject({
      seat: 9,
      isKeySheet: true,
    });
    expect(html).toContain('ANSWER KEY');
  });

  it('gives every sheet its own page and four registration marks each', () => {
    const html = buildPaperSheetsHtml(
      job({
        sheets: [sheet({ seat: 1 }), sheet({ seat: 2 }), sheet({ seat: 3 })],
      })
    );
    expect(pages(html)).toHaveLength(3);
    for (const page of pages(html)) {
      expect(page.match(/class="reg"/g)).toHaveLength(4);
    }
  });

  it('prints each bubble with its own choice letter inside it', () => {
    const html = buildPaperSheetsHtml(
      job({ questionCount: 3, choiceCount: 4 })
    );
    const letters = [
      ...html.matchAll(/<div class="bub"[^>]*>([A-E])<\/div>/g),
    ].map((m) => m[1]);
    expect(letters).toEqual([...'ABCD', ...'ABCD', ...'ABCD']);
  });

  it('stops at the choice count rather than always printing A-E', () => {
    const html = buildPaperSheetsHtml(
      job({ questionCount: 1, choiceCount: 3 })
    );
    const letters = [
      ...html.matchAll(/<div class="bub"[^>]*>([A-E])<\/div>/g),
    ].map((m) => m[1]);
    expect(letters).toEqual(['A', 'B', 'C']);
  });

  it('prints the in-bubble letter no darker than the reader can binarise away', () => {
    expect(BUBBLE_LETTER_GREY).toBeGreaterThanOrEqual(MIN_BUBBLE_LETTER_GREY);
    const grey = BUBBLE_LETTER_GREY.toString(16).padStart(2, '0');
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    printPaperSheets(
      job(),
      () =>
        ({
          document: doc,
          focus: vi.fn(),
          print: vi.fn(),
          close: vi.fn(),
          onafterprint: null,
        }) as unknown as Window
    );
    expect(doc.write.mock.calls[0][0]).toContain(
      `color: #${grey}${grey}${grey};`
    );
  });

  it('brands every sheet with the Spartron footer', () => {
    const html = buildPaperSheetsHtml(
      job({ sheets: [sheet({ seat: 1 }), sheet({ seat: 2 })] })
    );
    for (const page of pages(html)) {
      expect(page.match(/class="foot"/g)).toHaveLength(1);
      expect(page).toContain('aria-label="SPARTRON"');
      expect(page).toContain('SpartBoard Responses');
    }
  });

  it('continues a long test onto further pages without repeating rows', () => {
    const html = buildPaperSheetsHtml(
      job({ questionCount: QUESTIONS_PER_PAGE + 3 })
    );
    const rendered = pages(html);
    expect(rendered).toHaveLength(2);
    expect(rendered[0].match(/class="bub"/g)).toHaveLength(
      QUESTIONS_PER_PAGE * 4
    );
    expect(rendered[1].match(/class="bub"/g)).toHaveLength(3 * 4);
    expect(rendered[1]).toContain(`>${QUESTIONS_PER_PAGE + 1}<`);
  });

  it('keeps the right half empty when the job asks for one column', () => {
    const html = buildPaperSheetsHtml(
      job({ questionCount: 40, columnsPerPage: 1 })
    );
    const rendered = pages(html);
    expect(rendered).toHaveLength(2);
    expect(rendered[0].match(/class="bub"/g)).toHaveLength(ROWS_PER_COLUMN * 4);
    expect(rendered[1].match(/class="bub"/g)).toHaveLength(15 * 4);
    expect(rendered[1]).toContain(`>${ROWS_PER_COLUMN + 1}<`);
    // Every answer-grid element stays left of the band the stimuli will use.
    const lefts = [
      ...html.matchAll(
        /<div class="(?:num|bub|legend)" style="left:([\d.]+)mm/g
      ),
    ].map((m) => Number(m[1]));
    expect(lefts.length).toBeGreaterThan(0);
    expect(Math.max(...lefts)).toBeLessThan(
      Math.min(COLUMN_X_MM[1], STIMULUS_RECT_MM.x)
    );
  });

  it('prints two columns byte for byte as before when the job says nothing', () => {
    expect(buildPaperSheetsHtml(job({ questionCount: 40 }))).toEqual(
      buildPaperSheetsHtml(job({ questionCount: 40, columnsPerPage: 2 }))
    );
  });

  it('prints only the requested number of bubbles per row', () => {
    const html = buildPaperSheetsHtml(
      job({ questionCount: 5, choiceCount: 2 })
    );
    expect(html.match(/class="bub"/g)).toHaveLength(10);
    expect(html.match(/class="legend"/g)).toHaveLength(2);
  });

  it('clamps a choice count outside the printable range', () => {
    expect(
      buildPaperSheetsHtml(job({ questionCount: 1, choiceCount: 99 })).match(
        /class="bub"/g
      )
    ).toHaveLength(5);
    expect(
      buildPaperSheetsHtml(job({ questionCount: 1, choiceCount: 0 })).match(
        /class="bub"/g
      )
    ).toHaveLength(2);
  });

  it('escapes a name or title that would otherwise break the document', () => {
    const html = buildPaperSheetsHtml(
      job({
        quizTitle: '<script>alert(1)</script>',
        sheets: [sheet({ displayName: 'O"Brien & Sons <b>' })],
      })
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('O&quot;Brien &amp; Sons &lt;b&gt;');
  });

  it('labels a spare sheet without a class', () => {
    const html = buildPaperSheetsHtml(
      job({
        sheets: [
          sheet({ student: null, displayName: 'Name ___', className: '' }),
        ],
      })
    );
    expect(html).toContain('Page 1 of 1');
    expect(html).not.toContain(' · Page');
  });
});

describe('printPaperSheets', () => {
  const fakeWindow = () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    return {
      document: doc,
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
      onafterprint: null as (() => void) | null,
    };
  };

  it('writes the document and opens the print dialog', () => {
    const win = fakeWindow();
    printPaperSheets(job(), () => win as unknown as Window);
    expect(win.document.write).toHaveBeenCalledOnce();
    expect(win.document.write.mock.calls[0][0]).toContain('<!doctype html>');
    expect(win.print).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledBefore(win.print);
  });

  it('arms the auto-close handler before printing', () => {
    const win = fakeWindow();
    printPaperSheets(job(), () => win as unknown as Window);
    expect(typeof win.onafterprint).toBe('function');
    win.onafterprint?.();
    win.onafterprint?.();
    expect(win.close).toHaveBeenCalledOnce();
  });

  it('reports a blocked pop-up distinguishably', () => {
    expect(() => printPaperSheets(job(), () => null)).toThrow(/pop-ups/i);
  });

  it('does nothing when there is nothing to print', () => {
    const open = vi.fn();
    printPaperSheets(job({ sheets: [] }), open);
    expect(open).not.toHaveBeenCalled();
  });
});

// A delegated stack names the teacher it is for (D17); a self-printed one must
// keep rendering exactly as it did before that option existed.
describe('printed for a PLC teammate', () => {
  it('names the teacher in the header meta line', () => {
    const html = buildPaperSheetsHtml(
      job({ printedForTeacherName: 'Ms. Alvarez' })
    );
    expect(html).toContain('Ms. Alvarez · Period 1 · Page 1 of 1');
  });

  it('leaves the self-print header byte-identical', () => {
    expect(
      buildPaperSheetsHtml(job({ printedForTeacherName: undefined }))
    ).toBe(buildPaperSheetsHtml(job()));
    expect(buildPaperSheetsHtml(job())).toContain('Period 1 · Page 1 of 1');
  });

  it('still names the teacher on an unnamed spare, which has no class', () => {
    const html = buildPaperSheetsHtml(
      job({
        printedForTeacherName: 'Ms. Alvarez',
        sheets: [
          sheet({ student: null, className: '', displayName: 'Name __' }),
        ],
      })
    );
    expect(html).toContain('Ms. Alvarez · Page 1 of 1');
  });
});

describe('buildPaperSheetsHtml — sheet stimuli', () => {
  const stimulus = (
    over: Partial<PaperSheetStimulus> = {}
  ): PaperSheetStimulus => ({
    id: 'stim-1',
    label: 'Unit 3 graph',
    source: 'image',
    driveFileId: 'drive-1',
    widthPx: 800,
    heightPx: 400,
    ...over,
  });

  const stimulusJob = (over: Partial<PaperPrintJob> = {}): PaperPrintJob =>
    job({
      questionCount: 40,
      columnsPerPage: 1,
      sheetStimuli: [stimulus()],
      stimulusImageSrc: { 'stim-1': 'blob:one' },
      ...over,
    });

  const srcs = (html: string): string[] =>
    [...html.matchAll(/<img class="stim"[^>]*src="([^"]+)"/g)].map((m) => m[1]);

  it('draws the stack inside the band, on every page of every sheet', () => {
    const html = buildPaperSheetsHtml(
      stimulusJob({ sheets: [sheet({ seat: 1 }), sheet({ seat: 2 })] })
    );
    const rendered = pages(html);
    expect(rendered).toHaveLength(4);
    for (const page of rendered) {
      expect(srcs(page)).toEqual(['blob:one']);
      const left = Number(
        /<img class="stim"[^>]*left:([\d.]+)mm/.exec(page)?.[1]
      );
      const top = Number(
        /<img class="stim"[^>]*top:([\d.]+)mm/.exec(page)?.[1]
      );
      expect(left).toBeGreaterThanOrEqual(STIMULUS_RECT_MM.x);
      expect(top).toBeGreaterThanOrEqual(STIMULUS_RECT_MM.y);
    }
  });

  it('prints a stimulus only on the page it is pinned to', () => {
    const html = buildPaperSheetsHtml(
      stimulusJob({
        sheetStimuli: [stimulus({ id: 'p2', page: 2 })],
        stimulusImageSrc: { p2: 'blob:two' },
      })
    );
    const rendered = pages(html);
    expect(srcs(rendered[0])).toEqual([]);
    expect(srcs(rendered[1])).toEqual(['blob:two']);
  });

  it('skips a stimulus whose image never resolved rather than printing a gap', () => {
    const html = buildPaperSheetsHtml(stimulusJob({ stimulusImageSrc: {} }));
    expect(srcs(html)).toEqual([]);
  });

  it('prints a caption under its stimulus', () => {
    const html = buildPaperSheetsHtml(
      stimulusJob({ sheetStimuli: [stimulus({ caption: 'Figure 1 & 2' })] })
    );
    expect(html).toContain('Figure 1 &amp; 2');
    const top = Number(/<img class="stim"[^>]*top:([\d.]+)mm/.exec(html)?.[1]);
    const capTop = Number(
      /<div class="stim-cap"[^>]*top:([\d.]+)mm/.exec(html)?.[1]
    );
    expect(capTop).toBeGreaterThan(top);
  });

  it('draws nothing in the band while the sheet still prints two columns', () => {
    // The right half is answer rows there, whatever the job was handed.
    const html = buildPaperSheetsHtml(
      stimulusJob({ columnsPerPage: 2, questionCount: 40 })
    );
    expect(srcs(html)).toEqual([]);
    expect(html).toBe(buildPaperSheetsHtml(job({ questionCount: 40 })));
  });
});

describe('printPaperSheets — waiting for images', () => {
  /** A print window whose `print()` we can watch for. */
  const fakeWindow = (images: HTMLImageElement[]) => {
    const print = vi.fn();
    const win = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
        images,
      },
      focus: vi.fn(),
      print,
      close: vi.fn(),
      onafterprint: null,
    } as unknown as Window;
    return { win, print };
  };

  const stimulusJob: PaperPrintJob = {
    batchId: 'batch-1',
    quizTitle: 'Unit 3 Test',
    questionCount: 25,
    choiceCount: 4,
    columnsPerPage: 1,
    sheets: [sheet()],
    sheetStimuli: [
      {
        id: 'stim-1',
        label: 'Graph',
        source: 'image',
        widthPx: 800,
        heightPx: 400,
      },
    ],
    stimulusImageSrc: { 'stim-1': 'blob:one' },
  };

  it('holds the dialog until every image has decoded', async () => {
    let release!: () => void;
    const decoded = new Promise<void>((resolve) => {
      release = resolve;
    });
    const image = { decode: () => decoded } as unknown as HTMLImageElement;
    const { win, print } = fakeWindow([image]);

    printPaperSheets(stimulusJob, () => win);
    expect(print).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('still prints when an image refuses to decode', async () => {
    const image = {
      decode: () => Promise.reject(new Error('broken')),
    } as unknown as HTMLImageElement;
    const { win, print } = fakeWindow([image]);

    printPaperSheets(stimulusJob, () => win);
    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('prints straight away when there is nothing to wait for', () => {
    const { win, print } = fakeWindow([]);
    printPaperSheets(job(), () => win);
    expect(print).toHaveBeenCalledTimes(1);
  });
});
