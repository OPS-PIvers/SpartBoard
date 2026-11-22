import { plainMathText, promptPrintHtml } from './promptMath';
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
import type { ChoicePicture } from './quizAnswerImages';

export interface PaperTestQuestion {
  /** Number printed on the answer sheet: the row, or the quiz position on a sheet with written boxes (D11). */
  row: number | string;
  text: string;
  /** Option text in printed letter order. */
  choices: readonly string[];
  /** A picture per choice, null where none; a picture-only choice prints without its label. */
  choicePictures?: readonly (ChoicePicture | null)[];
  /** Answered in a written box on the answer sheet, not bubbled (D18). */
  written?: boolean;
  /** A section heading printed above this question, the first of its section (E15). */
  section?: { title: string; directions?: string; chooseLine?: string };
}

export interface PaperTestJob {
  quizTitle: string;
  questions: readonly PaperTestQuestion[];
  /** One copy per version, each on fresh pages under its label; replaces `questions` (QUIZ_IMPORT_VERSIONS.md V24). */
  versions?: readonly {
    label: string;
    questions: readonly PaperTestQuestion[];
  }[];
  /** A printed group's supports, on a page after the questions. */
  supports?: readonly { title: string; body: string }[];
}

const STYLES = `
  @page { size: 215.9mm 279.4mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 11pt; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 3mm; }
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
  .cpic { display: block; max-height: 30mm; max-width: 60mm; object-fit: contain; margin: 0.5mm 0; }
  .written { margin: 1.5mm 0 0; font-size: 10pt; font-style: italic; }
  .version { break-before: page; }
  .version:first-child { break-before: auto; }
  .version-label { font-size: 12pt; font-weight: bold; margin: -2mm 0 4mm; }
  .supports { break-before: page; }
  .supports h2 { font-size: 13pt; margin: 0 0 4mm; }
  .supports section { break-inside: avoid; margin-bottom: 5mm; }
  .supports h3 { font-size: 11pt; margin: 0 0 1mm; }
  .supports p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

function choiceHtml(text: string, picture: ChoicePicture | null | undefined) {
  if (!picture) return escapeHtml(plainMathText(text));
  const img = `<img class="cpic" src="${escapeHtml(picture.url)}" alt="${escapeHtml(picture.alt ?? '')}">`;
  return picture.only ? img : `${img}${escapeHtml(plainMathText(text))}`;
}

function questionHtml(q: PaperTestQuestion): string {
  // A stub's options are just the bubble letters, which say nothing to a student.
  const choices = q.written
    ? '<p class="written">Answer on your answer sheet</p>'
    : isPlaceholderLetterChoices(q.choices)
      ? ''
      : `<ol class="c">${q.choices
          .map(
            (c, i) =>
              `<li><span class="letter">${CHOICE_LETTERS[i]}.</span><span class="text">${choiceHtml(c, q.choicePictures?.[i])}</span></li>`
          )
          .join('')}</ol>`;
  const section = q.section
    ? `<li class="section"><h2>${escapeHtml(q.section.title)}</h2>${
        q.section.directions ? `<p>${escapeHtml(q.section.directions)}</p>` : ''
      }${q.section.chooseLine ? `<p><strong>${escapeHtml(q.section.chooseLine)}</strong></p>` : ''}</li>`
    : '';
  return `${section}<li><span class="num">${escapeHtml(String(q.row))}.</span><div><div class="text">${promptPrintHtml(q.text)}</div>${choices}</div></li>`;
}

function testHtml(
  quizTitle: string,
  questions: readonly PaperTestQuestion[],
  label?: string
): string {
  return `<h1>${escapeHtml(quizTitle)}</h1>${
    label ? `<p class="version-label">${escapeHtml(label)}</p>` : ''
  }
<div class="meta"><div>Name <span></span></div><div>Class <span></span></div></div>
<ol class="q">${questions.map(questionHtml).join('')}</ol>`;
}

function supportsHtml(supports: PaperTestJob['supports']): string {
  if (!supports?.length) return '';
  return `<div class="supports"><h2>Supports</h2>${supports
    .map(
      (s) =>
        `<section><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p></section>`
    )
    .join('')}</div>`;
}

/** The document `printPaperTest` would write. Exported for tests. */
export function buildPaperTestHtml(job: PaperTestJob): string {
  if (job.versions?.length) {
    return job.versions
      .map(
        (v) =>
          `<section class="version">${testHtml(job.quizTitle, v.questions, v.label)}</section>`
      )
      .join('');
  }
  return testHtml(job.quizTitle, job.questions) + supportsHtml(job.supports);
}

export function printPaperTest(
  job: PaperTestJob,
  openWindow?: OpenWindow
): void {
  if (
    job.questions.length === 0 &&
    !job.versions?.some((v) => v.questions.length)
  )
    return;
  printHtmlDocument(
    {
      title: `${job.quizTitle} — test`,
      styles: STYLES,
      body: buildPaperTestHtml(job),
      marginMm: { vertical: 18, horizontal: 20 },
      // Same mark, size and place as the bubble sheet's footer.
      footer: `<div class="brand">${spartronLogoSvg(4.2)}<span class="brand-tag">${escapeHtml(SPARTRON_TAGLINE)}</span></div>`,
    },
    openWindow
  );
}
