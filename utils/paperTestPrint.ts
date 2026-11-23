import { plainMathText, promptPrintHtml } from './promptMath';
/**
 * Prints the test paper that goes with a batch of answer sheets: every
 * bubbled question, numbered to match the sheet, with its choices lettered in
 * the order the batch recorded. That recorded order is what lets the import
 * turn a bubbled letter back into the option a student chose.
 */

import {
  escapeHtml,
  marginStyles,
  printHtmlDocument,
  withDrawnMargins,
  type OpenWindow,
} from './printHtmlDocument';
import { CHOICE_LETTERS } from './paperSheetLayout';
import { isPlaceholderLetterChoices } from './paperSheetPlan';
import { SPARTRON_TAGLINE, spartronLogoSvg } from './spartronLogo';
import type { ChoicePicture } from './quizAnswerImages';
import {
  type PaperTestPage,
  type PaperTestResource,
  type PaperTestStimulus,
} from './paperTestStimuli';
import {
  paperGroupInstruction,
  paperPrintWords,
  type PaperPrintWords,
} from './paperPrintWords';
import type { PaperRowGroup } from '@/types';

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
  /** Matching, ordering or choose all: `choices` are its lettered options or items. */
  group?: PaperRowGroup;
  /** Matching: the terms, numbered 3.1, 3.2 to match the sheet's rows. */
  terms?: readonly string[];
  /** A section heading printed above this question, the first of its section (E15). */
  section?: { title: string; directions?: string; chooseLine?: string };
  /** Stimuli printed in the question, between its text and its choices. */
  stimuli?: readonly PaperTestStimulus[];
  /** Letters of the resource pages this question uses. */
  resources?: readonly string[];
}

export interface PaperTestJob {
  quizTitle: string;
  questions: readonly PaperTestQuestion[];
  /** One copy per version, each on fresh pages under its label; replaces `questions` (QUIZ_IMPORT_VERSIONS.md V24). */
  versions?: readonly {
    label: string;
    questions: readonly PaperTestQuestion[];
    resources?: readonly PaperTestResource[];
  }[];
  /** Stimuli shared by several questions, printed after the questions. */
  resources?: readonly PaperTestResource[];
  /** A printed group's supports, on a page after the questions (after each version's copy). */
  supports?: readonly { title: string; body: string }[];
  /** The copy's language, for the words printed around stimuli; absent = English. */
  language?: string;
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
  .group-line { margin: 1mm 0 0; font-size: 10pt; font-style: italic; }
  .match { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 6mm; }
  ol.c.terms > li { grid-template-columns: 10mm 1fr; }
  .version { break-before: page; }
  .version:first-child { break-before: auto; }
  .version-label { font-size: 12pt; font-weight: bold; margin: -2mm 0 4mm; }
  .supports { break-before: page; }
  .supports h2 { font-size: 13pt; margin: 0 0 4mm; }
  .supports section { break-inside: avoid; margin-bottom: 5mm; }
  .supports h3 { font-size: 11pt; margin: 0 0 1mm; }
  .supports p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  ol.q > li.tall { break-inside: auto; }
  .resources { break-before: page; }
  .resource { margin: 0 0 6mm; }
  .resource h2 { font-size: 18pt; text-align: center; padding-bottom: 1.5mm; border-bottom: 0.4mm solid #000; margin: 0 0 3mm; break-after: avoid; }
  .use-res { margin: 1.5mm 0 0; font-weight: bold; }
  .stim-item { margin: 0 0 3mm; }
  .stim-item h3 { font-size: 11pt; margin: 0 0 1mm; break-after: avoid; }
  .stim-text { border: 0.3mm solid #000; padding: 3mm 4mm; white-space: pre-wrap; line-height: 1.45; overflow-wrap: anywhere; }
  .stim-img { display: block; max-width: 100%; max-height: 200mm; object-fit: contain; break-inside: avoid; }
  .stim-page { display: block; max-width: 100%; height: auto; break-inside: avoid; margin: 0 0 4mm; }
  .stim-bank { display: grid; gap: 1.5mm 3mm; border: 0.3mm solid #000; padding: 3mm; }
  .stim-bank + .stim-bank { margin-top: 2mm; }
  .stim-bank span { border: 0.2mm solid #666; padding: 1mm 2mm; text-align: center; }
  .stim-link { margin: 0; overflow-wrap: anywhere; }
  .q-stim { margin: 2mm 0 0; }
  .q-stim .stim-img { max-height: 110mm; }
`;

function choiceHtml(text: string, picture: ChoicePicture | null | undefined) {
  if (!picture) return escapeHtml(plainMathText(text));
  const img = `<img class="cpic" src="${escapeHtml(picture.url)}" alt="${escapeHtml(picture.alt ?? '')}">`;
  return picture.only ? img : `${img}${escapeHtml(plainMathText(text))}`;
}

/** Tallest a file page prints, so it fits one sheet under its heading. */
const PAGE_MAX_H_MM = 215;

/** A file page prints at its original size, narrowed only to fit the sheet's height; CSS caps it at the column width. */
function pageWidthMm(pg: PaperTestPage): number {
  if (pg.heightMm <= PAGE_MAX_H_MM) return pg.widthMm;
  return (pg.widthMm * PAGE_MAX_H_MM) / pg.heightMm;
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
      return `<div class="stim-item">${heading}${item.pages
        .map(
          (pg) =>
            `<img class="stim-page" src="${escapeHtml(pg.src)}" alt="" style="width:${pageWidthMm(pg).toFixed(1)}mm">`
        )
        .join('')}</div>`;
    case 'link':
      return `<div class="stim-item"><p class="stim-link"><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.url)}</p></div>`;
  }
}

function resourcesHtml(
  resources: readonly PaperTestResource[] | undefined,
  words: PaperPrintWords
): string {
  if (!resources?.length) return '';
  return `<div class="resources">${resources
    .map(
      (r) =>
        `<section class="resource"><h2>${escapeHtml(words.resource(r.letter))}</h2>${stimulusItemHtml(r.item)}</section>`
    )
    .join('')}</div>`;
}

/** A question whose stimuli could fill most of a page may split, so it doesn't leave a blank page behind. */
function isTall(stimuli: readonly PaperTestStimulus[] | undefined): boolean {
  if (!stimuli?.length) return false;
  const images = stimuli.filter((x) => x.kind === 'image').length;
  return (
    images > 1 ||
    stimuli.some(
      (x) =>
        x.kind === 'pages' ||
        (x.kind === 'text' && x.text.length > 600) ||
        (x.kind === 'word-bank' && x.groups.flat().length > 24)
    )
  );
}

const letteredHtml = (choices: readonly string[]): string =>
  `<ol class="c">${choices
    .map(
      (c, i) =>
        `<li><span class="letter">${CHOICE_LETTERS[i]}.</span><span class="text">${escapeHtml(plainMathText(c))}</span></li>`
    )
    .join('')}</ol>`;

/** Instruction and lettered lists for matching, ordering and choose all. */
function groupHtml(q: PaperTestQuestion, group: PaperRowGroup): string {
  const row = String(q.row);
  const terms = q.terms ?? [];
  const inst = `<p class="group-line">${escapeHtml(
    paperGroupInstruction(group, {
      across: false,
      unusedLetters: terms.length < q.choices.length,
      firstRow: `${row}.1`,
    })
  )}</p>`;
  if (group !== 'match') return `${inst}${letteredHtml(q.choices)}`;
  const termList = `<ol class="c terms">${terms
    .map(
      (t, i) =>
        `<li><span class="letter">${escapeHtml(`${row}.${i + 1}`)}</span><span class="text">${escapeHtml(plainMathText(t))}</span></li>`
    )
    .join('')}</ol>`;
  return `${inst}<div class="match">${termList}${letteredHtml(q.choices)}</div>`;
}

function questionHtml(q: PaperTestQuestion, words: PaperPrintWords): string {
  // A stub's options are just the bubble letters, which say nothing to a student.
  const choices = q.group
    ? groupHtml(q, q.group)
    : q.written
      ? `<p class="written">${escapeHtml(words.writeOnSheet)}</p>`
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
  const stimuli = q.stimuli?.length
    ? `<div class="q-stim">${q.stimuli.map(stimulusItemHtml).join('')}</div>`
    : '';
  const uses = q.resources?.length
    ? `<p class="use-res">${escapeHtml(words.useResources(q.resources))}</p>`
    : '';
  const tall = isTall(q.stimuli) ? ' class="tall"' : '';
  return `${section}<li${tall}><span class="num">${escapeHtml(String(q.row))}.</span><div><div class="text">${promptPrintHtml(q.text)}</div>${stimuli}${uses}${choices}</div></li>`;
}

function testHtml(
  quizTitle: string,
  questions: readonly PaperTestQuestion[],
  words: PaperPrintWords,
  label?: string
): string {
  return `<h1>${escapeHtml(quizTitle)}</h1>${
    label ? `<p class="version-label">${escapeHtml(label)}</p>` : ''
  }
<div class="meta"><div>${escapeHtml(words.name)} <span></span></div><div>${escapeHtml(words.className)} <span></span></div></div>
<ol class="q">${questions.map((q) => questionHtml(q, words)).join('')}</ol>`;
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
  const words = paperPrintWords(job.language);
  if (job.versions?.length) {
    return job.versions
      .map(
        (v) =>
          `<section class="version">${testHtml(job.quizTitle, v.questions, words, v.label)}${resourcesHtml(v.resources, words)}${supportsHtml(job.supports)}</section>`
      )
      .join('');
  }
  return (
    testHtml(job.quizTitle, job.questions, words) +
    resourcesHtml(job.resources, words) +
    supportsHtml(job.supports)
  );
}

/** Test paper styles scoped under `.tp`, so a copy can sit beside the response sheets in one document. */
function scopedStyles(css: string): string {
  return css
    .split('\n')
    .map((line) => {
      if (line.trim().startsWith('@')) return '';
      const m = /^(\s*)([^{]+)\{(.*)$/.exec(line);
      if (!m) return line;
      const sel = m[2].trim();
      if (sel === '*') return `${m[1]}.tp, .tp * {${m[3]}`;
      if (sel === 'body') return `${m[1]}.tp {${m[3]}`;
      const scoped = sel
        .split(',')
        .map((x) => `.tp ${x.trim()}`)
        .join(', ');
      return `${m[1]}${scoped} {${m[3]}`;
    })
    .join('\n');
}

const TEST_MARGINS = { vertical: 18, horizontal: 20 };
const testFooter = (): string =>
  `<div class="brand">${spartronLogoSvg(4.2)}<span class="brand-tag">${escapeHtml(SPARTRON_TAGLINE)}</span></div>`;

/** Styles for test paper copies printed inside the response sheet document. */
export const PAPER_TEST_PACKET_STYLES = `${scopedStyles(STYLES)}${scopedStyles(
  marginStyles(TEST_MARGINS)
)}
  .tp { break-after: page; }
  .tp .num { position: static; font-size: inherit; text-align: left; line-height: inherit; }
`;

/** One test paper copy per version (or one for the whole quiz), to print at the front of each student's packet. */
export function paperTestPacketCopies(job: PaperTestJob): string[] {
  const words = paperPrintWords(job.language);
  const copy = (body: string): string =>
    `<div class="tp">${withDrawnMargins(body, testFooter())}</div>`;
  if (job.versions?.length)
    return job.versions.map((v) =>
      copy(
        testHtml(job.quizTitle, v.questions, words, v.label) +
          resourcesHtml(v.resources, words) +
          supportsHtml(job.supports)
      )
    );
  return [copy(buildPaperTestHtml(job))];
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
      marginMm: TEST_MARGINS,
      // Same mark, size and place as the bubble sheet's footer.
      footer: testFooter(),
    },
    openWindow
  );
}
