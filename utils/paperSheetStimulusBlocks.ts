// Question stimuli drawn on a response sheet with question text, and the resource pages that go with it.
import { escapeHtml } from './printHtmlDocument';
import type { QuizQuestion, QuizStimulus } from '@/types';
import {
  attachPaperTestStimuli,
  paperTestStimulus,
  type PaperTestPage,
  type PaperTestResource,
  type PaperTestStimulus,
  type PaperTestStimulusFiles,
  type PrintedQuestionRef,
} from './paperTestStimuli';
import { ENGLISH_PRINT_WORDS, type PaperPrintWords } from './paperPrintWords';

/** A stimulus block as the sheet prints it: fixed width, measured height. */
export interface SheetStimulusBlock {
  html: string;
  heightMm: number;
}

/** One printed resource page: what its header says and the content under it. */
export interface SheetResourcePage {
  title: string;
  html: string;
}

/** Tallest a question's own stimuli may print on the sheet; taller ones print as resources. */
export const MAX_INLINE_STIMULUS_MM = 120;
/** Gap between a stimulus block and the stem above or the answers below it. */
export const BLOCK_GAP_MM = 1.5;
/** Content area of a resource page: inside the corner windows, under the header. */
/** A stimulus page's centered title sits above its body. */
export const RESOURCE_TITLE_TOP_MM = 48;
export const RESOURCE_BODY_MM = { x: 35, y: 62, w: 146, h: 201 } as const;

const IMAGE_MAX_H_MM = 100;
/** A picture prints no bigger than about 150 dpi, so a small one is not blown up. */
const IMAGE_PX_PER_MM = 150 / 25.4;
const PAGE_MAX_H_MM = 190;
const PX_TO_MM = 25.4 / 96;

export const SHEET_BLOCK_STYLES = `
  .sb { position: absolute; overflow: hidden; padding-right: 0.5mm; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .sb-item + .sb-item { margin-top: 2.5mm; }
  .sb-title { font-size: 10pt; font-weight: 700; margin: 0 0 1mm; }
  .sb-text { border: 0.3mm solid #000; padding: 2mm 3mm; font-size: 10pt; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
  .sb-text.cont { border-top-style: dashed; }
  .sb-bank { display: grid; gap: 1.2mm 2.5mm; border: 0.3mm solid #000; padding: 2mm; font-size: 10pt; }
  .sb-bank + .sb-bank { margin-top: 1.5mm; }
  .sb-bank span { border: 0.2mm solid #666; padding: 0.8mm 1.5mm; text-align: center; overflow-wrap: anywhere; }
  .sb-img { display: block; }
  .sb-img + .sb-img { margin-top: 2mm; }
  .sb-link { font-size: 10pt; margin: 0; overflow-wrap: anywhere; }
  .sb-use { font-size: 10pt; font-weight: 700; margin: 0; }
  .sb-item + .sb-use { margin-top: 1.5mm; }
`;

const mm = (n: number): string => `${n.toFixed(2)}mm`;

/** A picture's printed size: no wider than the block or 150 dpi, no taller than `maxH`. */
function fitPicture(
  widthPx: number | undefined,
  heightPx: number | undefined,
  widthMm: number,
  maxH: number
): { w: number; h: number } {
  const aspect = widthPx && heightPx ? heightPx / widthPx : 0.66;
  let w = Math.min(widthMm, widthPx ? widthPx / IMAGE_PX_PER_MM : widthMm);
  let h = w * aspect;
  if (h > maxH) {
    h = maxH;
    w = h / aspect;
  }
  return { w, h };
}

/** A file page at its original size, shrunk to the block's width and `maxH`. */
function fitPage(
  pg: PaperTestPage,
  widthMm: number,
  maxH: number
): { w: number; h: number } {
  const aspect = pg.heightMm / pg.widthMm;
  let w = Math.min(widthMm, pg.widthMm);
  let h = w * aspect;
  if (h > maxH) {
    h = maxH;
    w = h / aspect;
  }
  return { w, h };
}

function imgHtml(src: string, size: { w: number; h: number }): string {
  return `<img class="sb-img" src="${escapeHtml(src)}" alt="" style="width:${mm(size.w)};height:${mm(size.h)}">`;
}

/** One stimulus as sheet HTML at `widthMm`; `maxH` caps a picture or page. */
export function sheetStimulusItemHtml(
  item: PaperTestStimulus,
  widthMm: number,
  maxH = IMAGE_MAX_H_MM,
  continued = false
): string {
  const title =
    item.kind !== 'link' && item.title
      ? `<p class="sb-title">${escapeHtml(item.title)}</p>`
      : '';
  switch (item.kind) {
    case 'text':
      return `<div class="sb-item">${title}<div class="sb-text${continued ? ' cont' : ''}">${escapeHtml(item.text)}</div></div>`;
    case 'word-bank':
      return `<div class="sb-item">${title}${item.groups
        .map(
          (g) =>
            `<div class="sb-bank" style="grid-template-columns: repeat(${item.columns}, 1fr)">${g
              .map((w) => `<span>${escapeHtml(w)}</span>`)
              .join('')}</div>`
        )
        .join('')}</div>`;
    case 'image':
      return `<div class="sb-item">${title}${imgHtml(
        item.src,
        fitPicture(item.widthPx, item.heightPx, widthMm, maxH)
      )}</div>`;
    case 'pages':
      return `<div class="sb-item">${title}${item.pages
        .map((pg) =>
          imgHtml(pg.src, fitPage(pg, widthMm, Math.min(maxH, PAGE_MAX_H_MM)))
        )
        .join('')}</div>`;
    case 'link':
      return `<div class="sb-item"><p class="sb-link"><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.url)}</p></div>`;
  }
}

/** Height in mm of block HTML laid out at `widthMm`. */
export type BlockMeasure = (html: string, widthMm: number) => number;

/** Measures in a hidden box with the sheet's own styles; null where layout does not run (tests). */
export function browserBlockMeasure(): BlockMeasure | null {
  if (typeof document === 'undefined') return null;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  const style = document.createElement('style');
  style.textContent = SHEET_BLOCK_STYLES;
  const box = document.createElement('div');
  box.className = 'sb';
  box.style.position = 'relative';
  host.append(style, box);
  // The box joins the page only while it measures, so no hidden node outlives the dialog.
  const heightOf = (html: string): number => {
    document.body.append(host);
    box.innerHTML = html;
    const h = box.getBoundingClientRect().height;
    box.innerHTML = '';
    host.remove();
    return h;
  };
  // jsdom lays nothing out, so every height reads 0.
  if (heightOf('<div class="sb-text">x</div>') === 0) return null;
  return (html, widthMm) => {
    box.style.width = `${widthMm}mm`;
    return heightOf(html) * PX_TO_MM;
  };
}

/** A rough, generous height for when nothing can lay the block out. */
export function estimateBlockMm(html: string, widthMm: number): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const charsPerLine = Math.max(1, Math.floor((widthMm - 6) / 1.9));
  const breaks = (html.match(/\n/g) ?? []).length;
  let h = (Math.ceil(text.length / charsPerLine) + breaks) * 5 + 6;
  for (const m of html.matchAll(/height:([\d.]+)mm/g)) h += Number(m[1]) + 2;
  return h;
}

/** Each item's measured height, at the block width, in mm. */
export function measureItems(
  items: readonly PaperTestStimulus[],
  widthMm: number,
  measure: BlockMeasure
): number[] {
  return items.map((item) =>
    Math.ceil(measure(sheetStimulusItemHtml(item, widthMm), widthMm))
  );
}

/** Width every question's stimulus block prints at: the stem's width. */
export const BLOCK_WIDTH_MM = 144;

/** The block a question prints: its own stimuli, then the resources it points to. */
export function sheetStimulusBlock(
  items: readonly PaperTestStimulus[],
  resources: readonly string[],
  measure: BlockMeasure,
  words: PaperPrintWords = ENGLISH_PRINT_WORDS
): SheetStimulusBlock {
  const html =
    items.map((item) => sheetStimulusItemHtml(item, BLOCK_WIDTH_MM)).join('') +
    (resources.length
      ? `<p class="sb-use">${escapeHtml(words.useResources(resources))}</p>`
      : '');
  return { html, heightMm: Math.ceil(measure(html, BLOCK_WIDTH_MM)) + 1 };
}

/** What a response sheet with question text prints for stimuli. */
export interface SheetStimuliPlan {
  /** By question id: the block between its stem and its answers. */
  blocks: Map<string, SheetStimulusBlock>;
  resourcePages: SheetResourcePage[];
  /** By question id: pages printed just before it, for a stimulus the teacher put with the question that is too tall to share its page. */
  pagesBefore: Map<string, SheetResourcePage[]>;
}

/**
 * Places a printed set's stimuli on its response sheet. A question keeps its
 * own stimuli while they fit `MAX_INLINE_STIMULUS_MM`; the rest print as
 * resources, as shared ones do.
 */
export function planSheetStimuli(
  printed: readonly PrintedQuestionRef[],
  questionsById: ReadonlyMap<string, Pick<QuizQuestion, 'id' | 'stimulusIds'>>,
  stimuli: readonly QuizStimulus[],
  files: PaperTestStimulusFiles,
  measure: BlockMeasure,
  words: PaperPrintWords = ENGLISH_PRINT_WORDS
): SheetStimuliPlan {
  const first = attachPaperTestStimuli(printed, questionsById, stimuli, files);
  const byId = new Map(stimuli.map((s) => [s.id, s]));
  const heights = new Map<string, number>();
  const heightOf = (id: string): number => {
    const known = heights.get(id);
    if (known !== undefined) return known;
    const s = byId.get(id);
    const item = s ? paperTestStimulus(s, files) : null;
    const h = item
      ? measure(sheetStimulusItemHtml(item, BLOCK_WIDTH_MM), BLOCK_WIDTH_MM) +
        2.5
      : 0;
    heights.set(id, h);
    return h;
  };
  // The teacher's "With the question" keeps a tall one by the question, on a page before it; the default makes it a resource.
  const tooTall = new Set<string>();
  const ownPage = new Set<string>();
  for (const ids of first.inlineIds.values()) {
    let total = 0;
    for (const id of ids) {
      const h = heightOf(id);
      if (total + h <= MAX_INLINE_STIMULUS_MM) total += h;
      else if (byId.get(id)?.paperPlacement === 'question') ownPage.add(id);
      else tooTall.add(id);
    }
  }
  const placed =
    tooTall.size || ownPage.size
      ? attachPaperTestStimuli(
          printed,
          questionsById,
          stimuli,
          files,
          tooTall,
          ownPage
        )
      : first;
  const pagesBefore = new Map<string, SheetResourcePage[]>();
  if (ownPage.size) {
    for (const p of printed) {
      const items = (first.inlineIds.get(p.questionId) ?? []).flatMap((id) => {
        const s = ownPage.has(id) ? byId.get(id) : undefined;
        const item = s ? paperTestStimulus(s, files) : null;
        return item ? [{ title: words.question(p.row), item }] : [];
      });
      if (items.length)
        pagesBefore.set(p.questionId, paginateStimuli(items, measure, words));
    }
  }
  const blocks = new Map<string, SheetStimulusBlock>();
  for (const [qid, q] of placed.questions) {
    if (!q.stimuli?.length && !q.resources?.length) continue;
    blocks.set(
      qid,
      sheetStimulusBlock(q.stimuli ?? [], q.resources ?? [], measure, words)
    );
  }
  return {
    blocks,
    resourcePages: paginateResources(placed.resources, measure, words),
    pagesBefore,
  };
}

/** Paragraphs of a passage, each with the blank line that ended it. */
const paragraphsOf = (text: string): string[] =>
  text.split(/(?<=\n\s*\n)/).filter((p) => p.length > 0);

/**
 * Lays resources onto pages of the resource body. Each resource starts a page;
 * a long passage continues by paragraph, then by word; a picture or file page is
 * shrunk to fit one page.
 */
export function paginateResources(
  resources: readonly PaperTestResource[],
  measure: BlockMeasure,
  words: PaperPrintWords = ENGLISH_PRINT_WORDS
): SheetResourcePage[] {
  return paginateStimuli(
    resources.map((r) => ({ title: words.resource(r.letter), item: r.item })),
    measure,
    words
  );
}

/** Lays titled stimuli onto pages, as `paginateResources` does. */
export function paginateStimuli(
  entries: readonly { title: string; item: PaperTestStimulus }[],
  measure: BlockMeasure,
  words: PaperPrintWords = ENGLISH_PRINT_WORDS
): SheetResourcePage[] {
  const { w, h } = RESOURCE_BODY_MM;
  const pages: SheetResourcePage[] = [];
  const fits = (html: string): boolean => measure(html, w) <= h;
  for (const r of entries) {
    const title = r.title;
    const item = r.item;
    if (item.kind === 'pages') {
      item.pages.forEach((pg, i) => {
        const one: PaperTestStimulus = {
          kind: 'pages',
          pages: [pg],
          ...(i === 0 && item.title ? { title: item.title } : {}),
        };
        pages.push({
          title: i === 0 ? title : words.continued(title),
          html: sheetStimulusItemHtml(one, w, h - 8),
        });
      });
      continue;
    }
    if (item.kind !== 'text') {
      pages.push({ title, html: sheetStimulusItemHtml(item, w, h - 8) });
      continue;
    }
    // A passage fills pages by paragraph, splitting a paragraph by words only when it alone overflows.
    const pieces = paragraphsOf(item.text);
    let current = '';
    let first = true;
    const flush = () => {
      const text = current.replace(/\s+$/, '');
      current = '';
      if (!text) return;
      const part: PaperTestStimulus = {
        kind: 'text',
        text,
        ...(first && item.title ? { title: item.title } : {}),
      };
      pages.push({
        title: first ? title : words.continued(title),
        html: sheetStimulusItemHtml(part, w, h, !first),
      });
      first = false;
    };
    const htmlFor = (text: string) =>
      sheetStimulusItemHtml(
        {
          kind: 'text',
          text,
          ...(first && item.title ? { title: item.title } : {}),
        },
        w,
        h,
        !first
      );
    const queue = [...pieces];
    while (queue.length > 0) {
      const next = queue.shift() ?? '';
      if (fits(htmlFor(current + next))) {
        current += next;
        continue;
      }
      if (current) {
        flush();
        queue.unshift(next);
        continue;
      }
      // One paragraph taller than a page: take as many words as fit.
      const words = next.split(/(?<=\s)/);
      let lo = 1;
      let hi = words.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(htmlFor(words.slice(0, mid).join('')))) lo = mid;
        else hi = mid - 1;
      }
      current = words.slice(0, lo).join('');
      flush();
      const rest = words.slice(lo).join('');
      if (rest) queue.unshift(rest);
    }
    flush();
  }
  return pages;
}
