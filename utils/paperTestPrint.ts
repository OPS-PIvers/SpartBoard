/**
 * Prints the test paper that goes with a batch of answer sheets: every
 * bubbled question, numbered to match the sheet, with its choices lettered in
 * the order the batch recorded. That recorded order is what lets the import
 * turn a bubbled letter back into the option a student chose.
 */

import {
  escapeHtml,
  printHtmlDocument,
  type OpenWindow,
} from './printHtmlDocument';
import { CHOICE_LETTERS } from './paperSheetLayout';
import { isPlaceholderLetterChoices } from './paperSheetPlan';
import { SPARTRON_TAGLINE, spartronLogoSvg } from './spartronLogo';

export interface PaperTestQuestion {
  /** 1-based row number printed on the answer sheet. */
  row: number;
  text: string;
  /** Option text in printed letter order. */
  choices: readonly string[];
  /** A section heading printed above this question, the first of its section (E15). */
  section?: { title: string; directions?: string; chooseLine?: string };
}

export interface PaperTestJob {
  quizTitle: string;
  questions: readonly PaperTestQuestion[];
}

const STYLES = `
  @page { size: 215.9mm 279.4mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 11pt; }
  .brand { display: flex; align-items: center; gap: 3mm; margin-bottom: 5mm; }
  .brand svg { display: block; }
  .brand-tag { font-size: 8pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
  h1 { font-size: 15pt; margin: 0 0 4mm; }
  .meta { display: flex; gap: 12mm; font-size: 10pt; margin-bottom: 8mm; }
  .meta span { border-bottom: 1px solid #000; min-width: 60mm; display: inline-block; }
  ol.q { list-style: none; padding: 0; margin: 0; }
  ol.q > li { break-inside: avoid; margin-bottom: 5mm; display: grid; grid-template-columns: 10mm 1fr; }
  .num { font-weight: bold; }
  ol.q > li.section { display: block; margin: 6mm 0 3mm; break-after: avoid; }
  .section h2 { font-size: 12pt; margin: 0 0 1mm; }
  .section p { margin: 0 0 1mm; white-space: pre-wrap; }
  .text { white-space: pre-wrap; }
  ol.c { list-style: none; padding: 0; margin: 1.5mm 0 0; }
  ol.c > li { display: grid; grid-template-columns: 8mm 1fr; margin-top: 0.8mm; }
`;

function questionHtml(q: PaperTestQuestion): string {
  // A stub's options are just the bubble letters, which say nothing to a student.
  const choices = isPlaceholderLetterChoices(q.choices)
    ? ''
    : `<ol class="c">${q.choices
        .map(
          (c, i) =>
            `<li><span class="letter">${CHOICE_LETTERS[i]}.</span><span class="text">${escapeHtml(c)}</span></li>`
        )
        .join('')}</ol>`;
  const section = q.section
    ? `<li class="section"><h2>${escapeHtml(q.section.title)}</h2>${
        q.section.directions ? `<p>${escapeHtml(q.section.directions)}</p>` : ''
      }${q.section.chooseLine ? `<p><strong>${escapeHtml(q.section.chooseLine)}</strong></p>` : ''}</li>`
    : '';
  return `${section}<li><span class="num">${q.row}.</span><div><div class="text">${escapeHtml(q.text)}</div>${choices}</div></li>`;
}

/** The document `printPaperTest` would write. Exported for tests. */
export function buildPaperTestHtml(job: PaperTestJob): string {
  return `<div class="brand">${spartronLogoSvg(4.2)}<span class="brand-tag">${escapeHtml(SPARTRON_TAGLINE)}</span></div><h1>${escapeHtml(job.quizTitle)}</h1>
<div class="meta"><div>Name <span></span></div><div>Class <span></span></div></div>
<ol class="q">${job.questions.map(questionHtml).join('')}</ol>`;
}

export function printPaperTest(
  job: PaperTestJob,
  openWindow?: OpenWindow
): void {
  if (job.questions.length === 0) return;
  printHtmlDocument(
    {
      title: `${job.quizTitle} — test`,
      styles: STYLES,
      body: buildPaperTestHtml(job),
      marginMm: { vertical: 18, horizontal: 20 },
    },
    openWindow
  );
}
