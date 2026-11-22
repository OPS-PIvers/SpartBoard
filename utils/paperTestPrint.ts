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
import {
  stimulusForLine,
  type PaperTestStimulus,
  type PaperTestStimulusBlock,
} from './paperTestStimuli';

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
  /** Shared stimuli printed above this question, the first printed one that uses them. */
  stimuli?: PaperTestStimulusBlock;
  /** Pictures placed in the question, printed above its text. */
  inlineStimuli?: readonly PaperTestStimulus[];
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
  ol.q > li.stim { display: block; break-inside: auto; margin: 2mm 0 5mm; }
  .stim-for { font-weight: bold; margin: 0 0 2mm; break-after: avoid; }
  .stim-item { margin: 0 0 3mm; }
  .stim-item h3 { font-size: 11pt; margin: 0 0 1mm; break-after: avoid; }
  .stim-text { border: 0.3mm solid #000; padding: 3mm 4mm; white-space: pre-wrap; line-height: 1.45; overflow-wrap: anywhere; }
  .stim-img { display: block; max-width: 100%; max-height: 200mm; object-fit: contain; break-inside: avoid; }
  .stim-page { display: block; width: 100%; max-height: 220mm; object-fit: contain; border: 0.2mm solid #999; break-inside: avoid; margin-bottom: 2mm; }
  .stim-bank { display: grid; gap: 1.5mm 3mm; border: 0.3mm solid #000; padding: 3mm; }
  .stim-bank + .stim-bank { margin-top: 2mm; }
  .stim-bank span { border: 0.2mm solid #666; padding: 1mm 2mm; text-align: center; }
  .stim-link { margin: 0; overflow-wrap: anywhere; }
  .q-stim { margin: 0 0 1.5mm; }
  .q-stim .stim-img { max-height: 90mm; }
`;

function choiceHtml(text: string, picture: ChoicePicture | null | undefined) {
  if (!picture) return escapeHtml(plainMathText(text));
  const img = `<img class="cpic" src="${escapeHtml(picture.url)}" alt="${escapeHtml(picture.alt ?? '')}">`;
  return picture.only ? img : `${img}${escapeHtml(plainMathText(text))}`;
}

function stimulusItemHtml(item: PaperTestStimulus): string {
  const heading =
    item.kind !== 'link' && item.title
      ? `<h3>${escapeHtml(item.title)}</h3>`
      : '';
  switch (item.kind) {
    case 'text':
      return `<div class="stim-item">${heading}<div class="stim-text">${escapeHtml(item.text)}</div></div>`;
    case 'word-bank':
      return `<div class="stim-item">${heading}${item.groups
        .map(
          (g) =>
            `<div class="stim-bank" style="grid-template-columns: repeat(${item.columns}, 1fr)">${g
              .map((w) => `<span>${escapeHtml(w)}</span>`)
              .join('')}</div>`
        )
        .join('')}</div>`;
    case 'image':
      return `<div class="stim-item">${heading}<img class="stim-img" src="${escapeHtml(item.src)}" alt=""></div>`;
    case 'pages':
      return `<div class="stim-item">${heading}${item.srcs
        .map((src) => `<img class="stim-page" src="${escapeHtml(src)}" alt="">`)
        .join('')}</div>`;
    case 'link':
      return `<div class="stim-item"><p class="stim-link"><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.url)}</p></div>`;
  }
}

function stimulusBlockHtml(block: PaperTestStimulusBlock | undefined): string {
  if (!block?.items.length) return '';
  const forLine = stimulusForLine(block.forRows);
  return `<li class="stim">${
    forLine ? `<p class="stim-for">${escapeHtml(forLine)}</p>` : ''
  }${block.items.map(stimulusItemHtml).join('')}</li>`;
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
  const inline = q.inlineStimuli?.length
    ? `<div class="q-stim">${q.inlineStimuli.map(stimulusItemHtml).join('')}</div>`
    : '';
  return `${section}${stimulusBlockHtml(q.stimuli)}<li><span class="num">${escapeHtml(String(q.row))}.</span><div>${inline}<div class="text">${promptPrintHtml(q.text)}</div>${choices}</div></li>`;
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
  const body = buildPaperTestHtml(job);
  printHtmlDocument(
    {
      title: `${job.quizTitle} — test`,
      styles: STYLES,
      body,
      // Stimulus pictures and pages are large; an undecoded one prints as a blank box.
      awaitImages: body.includes('<img'),
      marginMm: { vertical: 18, horizontal: 20 },
      // Same mark, size and place as the bubble sheet's footer.
      footer: `<div class="brand">${spartronLogoSvg(4.2)}<span class="brand-tag">${escapeHtml(SPARTRON_TAGLINE)}</span></div>`,
    },
    openWindow
  );
}
