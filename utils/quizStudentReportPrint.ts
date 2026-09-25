import {
  escapeHtml,
  printHtmlDocument,
  type OpenWindow,
} from './printHtmlDocument';
import type {
  QuizResponseAnswer,
  QuizResponseStatus,
  QuizStimulus,
  WrittenReturnMode,
} from '@/types';
import type { StudentOutcome } from './quizQuestionDrilldown';
import {
  showsMissedKey,
  type StudentDrilldown,
  type StudentQuestionLine,
} from './quizStudentDrilldown';
import { formatExportPoints } from './assignmentExportShared';
import {
  buildFilledSheetHtml,
  SHEET_REPRINT_STYLES,
  type SheetWrittenFill,
} from './paperSheetPrint';
import { sheetFillFor, type SheetReprint } from './paperSheetReprint';
import { stimulusMediaUrl } from './quizStimuli';
import { annotatedSnapshotToHtml } from './writtenAnnotations';
import {
  DEFAULT_WRITTEN_RETURN_MODE,
  isPaperWrittenAnswer,
  paperWrittenView,
} from './paperWritten';

export interface StudentReportTarget {
  label: string;
  /** Rounded percent, or null when nothing on the target was scored. */
  percent: number | null;
  band: string | null;
}

export interface StudentReportJob {
  quizTitle: string;
  studentName: string;
  drilldown: StudentDrilldown;
  targets: readonly StudentReportTarget[];
  includeCorrectAnswers: boolean;
}

export const MARK_LABEL: Record<StudentOutcome, string> = {
  correct: 'Correct',
  partial: 'Partial',
  incorrect: 'Incorrect',
  ungraded: 'Ungraded',
  noAnswer: 'No answer',
  excused: 'Excused',
  notChosen: 'Not chosen',
};

const BAND_LABEL: Record<string, string> = {
  proficient: 'Proficient',
  approaching: 'Approaching',
  beginning: 'Beginning',
};

const STYLES = `
  @page { size: letter; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10.5pt; }
  h1 { font-size: 15pt; margin: 0 0 1mm; }
  .student { font-size: 12pt; font-weight: bold; margin: 0 0 1mm; }
  .score { margin: 0 0 5mm; }
  h2 { font-size: 11pt; margin: 5mm 0 2mm; }
  ol.q { list-style: none; padding: 0; margin: 0; }
  ol.q > li { break-inside: avoid; border-top: 1px solid #ccc; padding: 2mm 0; display: grid; grid-template-columns: 10mm 1fr auto; gap: 2mm; }
  .num { font-weight: bold; }
  .text { white-space: pre-wrap; }
  .answer { margin-top: 1mm; white-space: pre-wrap; }
  .key { margin-top: 0.5mm; color: #555; white-space: pre-wrap; }
  .mark { text-align: right; white-space: nowrap; font-weight: bold; }
  .pts { font-weight: normal; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  td { border-top: 1px solid #ccc; padding: 1.5mm 0; }
  td.pct { text-align: right; white-space: nowrap; }
`;

/** The document `printStudentReport` writes. Exported for tests. */
export function buildStudentReportHtml(job: StudentReportJob): string {
  const { drilldown } = job;
  const scoreLine =
    drilldown.percent === null
      ? 'Score: not scored yet'
      : `Score: ${drilldown.percent}% (${formatExportPoints(drilldown.pointsEarned)} of ${formatExportPoints(drilldown.pointsMax)} points)${drilldown.provisional ? ', provisional until every written answer is graded' : ''}`;

  const questions = drilldown.lines
    .map((line) => {
      const pts =
        line.mark === 'excused'
          ? ''
          : `<div class="pts">${formatExportPoints(line.pointsEarned)}/${formatExportPoints(line.pointsMax)}</div>`;
      const answer = line.answerText
        ? `<div class="answer">Answer: ${escapeHtml(line.answerText)}</div>`
        : '';
      const key =
        job.includeCorrectAnswers && showsMissedKey(line)
          ? `<div class="key">Correct answer: ${escapeHtml(line.correctAnswerText ?? '')}</div>`
          : '';
      return `<li><span class="num">Q${line.number}</span><div><div class="text">${escapeHtml(line.text)}</div>${answer}${key}</div><div class="mark">${MARK_LABEL[line.mark]}${pts}</div></li>`;
    })
    .join('');

  const targets =
    job.targets.length > 0
      ? `<h2>Learning targets</h2><table>${job.targets
          .map(
            (t) =>
              `<tr><td>${escapeHtml(t.label)}</td><td class="pct">${
                t.percent === null ? '—' : `${t.percent}%`
              }${t.band ? ` · ${escapeHtml(BAND_LABEL[t.band] ?? t.band)}` : ''}</td></tr>`
          )
          .join('')}</table>`
      : '';

  return `<h1>${escapeHtml(job.quizTitle)}</h1>
<p class="student">${escapeHtml(job.studentName)}</p>
<p class="score">${escapeHtml(scoreLine)}</p>${targets}
<h2>Questions</h2><ol class="q">${questions}</ol>`;
}

export function printStudentReport(
  job: StudentReportJob,
  openWindow?: OpenWindow
): void {
  printHtmlDocument(
    {
      title: `${job.quizTitle} — ${job.studentName}`,
      styles: STYLES,
      body: buildStudentReportHtml(job),
      marginMm: { vertical: 16, horizontal: 18 },
    },
    openWindow
  );
}

// ─── Multi-student results print (docs/plans/QUIZ_RESULTS_PRINT.md) ─────────

export type ResultsKeyMode = 'off' | 'missed' | 'all';
export type ResultsPrintLayout = 'report' | 'sheet' | 'both';

export interface QuizResultsPrintOptions {
  includeQuestions: boolean;
  markAnswers: boolean;
  keyMode: ResultsKeyMode;
  showScore: boolean;
  showClassDate: boolean;
  showTargets: boolean;
  showCommentBox: boolean;
  showWrittenFeedback: boolean;
  includeStimuli: boolean;
  duplexPadding: boolean;
  layout: ResultsPrintLayout;
  /** 'missed' prints only incorrect, partial and unanswered questions; absent means all. */
  questionScope?: ResultsQuestionScope;
}

export type ResultsQuestionScope = 'all' | 'missed';

const MISSED_MARKS: ReadonlySet<StudentOutcome> = new Set([
  'incorrect',
  'partial',
  'noAnswer',
]);

export interface ResultsPrintStudent {
  key: string;
  /** Real name; null when only the PIN or "Student" fallback resolves. */
  name: string | null;
  /** Family name first, so the stack comes out in roster order. */
  sortName: string;
  pin?: string;
  period: string | null;
  status: QuizResponseStatus;
  drilldown: StudentDrilldown;
  targets: readonly StudentReportTarget[];
  /** Paper work: options print lettered, in the batch's order. */
  lettered: boolean;
  /** Paper work whose batch still exists: the sheet can be redrawn (D21). */
  sheet?: SheetReprint;
  /** Handwritten paper answers by question id (docs/plans/QUIZ_PAPER_HANDWRITTEN_RESPONSES.md D41). */
  paperWritten?: Readonly<Record<string, PaperWrittenPrint>>;
}

/** One handwritten paper answer as the print sees it. */
export interface PaperWrittenPrint {
  answer: Pick<QuizResponseAnswer, 'answer' | 'paperTranscript' | 'artifacts'>;
  /** Image URL of the crop; null when it failed to load, absent while loading. */
  cropSrc?: string | null;
}

export interface ResultsPrintJob {
  quizTitle: string;
  stimuli: readonly QuizStimulus[];
  /** The teacher's period order; unknown periods sort after it. */
  periodOrder: readonly string[];
  students: readonly ResultsPrintStudent[];
  /** How handwritten paper answers print; the handwriting when absent. */
  writtenMode?: WrittenReturnMode;
}

const NO_PERIOD_LABEL = 'No class period';

/** Period order, then family name, then given name (D2a). */
export function sortResultsPrintStudents<
  T extends Pick<ResultsPrintStudent, 'period' | 'sortName' | 'key'>,
>(students: readonly T[], periodOrder: readonly string[]): T[] {
  const rank = (period: string | null) => {
    if (period === null) return Number.MAX_SAFE_INTEGER;
    const i = periodOrder.indexOf(period);
    return i < 0 ? periodOrder.length : i;
  };
  return [...students].sort(
    (a, b) =>
      rank(a.period) - rank(b.period) ||
      (a.period ?? '').localeCompare(b.period ?? '') ||
      a.sortName.localeCompare(b.sortName, undefined, {
        sensitivity: 'base',
      }) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const RESULT_GLYPH: Record<StudentOutcome, string> = {
  correct: '✓ Correct',
  partial: '◐ Partial',
  incorrect: '✗ Incorrect',
  ungraded: 'Not yet graded',
  noAnswer: '— No answer',
  excused: 'Excused',
  notChosen: 'Not chosen',
};

const STIMULUS_KIND: Record<QuizStimulus['type'], string> = {
  image: 'Picture',
  text: 'Passage',
  pdf: 'PDF',
  audio: 'Audio',
  video: 'Video',
  youtube: 'Video',
  'gdoc-embed': 'Google Doc',
};

const keyApplies = (line: StudentQuestionLine, mode: ResultsKeyMode): boolean =>
  line.correctAnswerText !== null &&
  (mode === 'all' || (mode === 'missed' && showsMissedKey(line)));

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const formatScore = (student: ResultsPrintStudent): string => {
  const d = student.drilldown;
  if (d.percent === null) return 'Score: not scored yet';
  const soFar = d.provisional || student.status !== 'completed';
  return `Score: ${formatExportPoints(d.pointsEarned)} / ${formatExportPoints(d.pointsMax)} (${d.percent}%)${soFar ? ' so far' : ''}`;
};

const markCell = (
  line: StudentQuestionLine,
  options: QuizResultsPrintOptions
): string => {
  if (!options.markAnswers) {
    return line.mark === 'ungraded'
      ? `<div class="mark">${RESULT_GLYPH.ungraded}</div>`
      : '<div class="mark"></div>';
  }
  const pts =
    line.mark === 'excused' || line.mark === 'ungraded'
      ? ''
      : `<div class="pts">${formatExportPoints(line.pointsEarned)}/${formatExportPoints(line.pointsMax)}</div>`;
  // A written answer is scored, not right or wrong: its points say it.
  const label =
    line.manual &&
    (line.mark === 'correct' ||
      line.mark === 'partial' ||
      line.mark === 'incorrect')
      ? ''
      : RESULT_GLYPH[line.mark];
  return `<div class="mark">${label}${pts}</div>`;
};

const tick = (correct: boolean) =>
  `<span class="tick">${correct ? '✓' : '✗'}</span>`;

function mcAnswer(
  line: StudentQuestionLine,
  student: ResultsPrintStudent,
  options: QuizResultsPrintOptions,
  showKey: boolean
): string {
  const multi = line.type === 'MA';
  const opts = line.options ?? [];
  const items = opts
    .map((opt, i) => {
      const letter =
        student.lettered && CHOICE_LETTERS[i]
          ? `<span class="letter">${CHOICE_LETTERS[i]}.</span> `
          : '';
      const mark =
        opt.picked && options.markAnswers ? ` ${tick(opt.correct)}` : '';
      const key =
        showKey && opt.correct
          ? ' <span class="keytag">Correct answer</span>'
          : '';
      const bullet = multi ? (opt.picked ? '☑' : '☐') : opt.picked ? '●' : '○';
      return `<li class="opt${opt.picked ? ' picked' : ''}"><span class="bullet">${bullet}</span> ${letter}${escapeHtml(opt.text)}${mark}${key}</li>`;
    })
    .join('');
  const unmatched =
    line.answerText && !opts.some((o) => o.picked)
      ? `<div class="answer">Answer: ${escapeHtml(line.answerText)}</div>`
      : '';
  return `<ul class="opts">${items}</ul>${unmatched}`;
}

function matchingAnswer(
  line: StudentQuestionLine,
  options: QuizResultsPrintOptions,
  showKey: boolean
): string {
  const rows = (line.pairs ?? [])
    .map((p) => {
      const mark = options.markAnswers && p.given ? ` ${tick(p.correct)}` : '';
      const key =
        showKey && !p.correct
          ? ` <span class="key">(correct: ${escapeHtml(p.expected)})</span>`
          : '';
      return `<li>${escapeHtml(p.term)} → ${p.given ? escapeHtml(p.given) : '<em>no answer</em>'}${mark}${key}</li>`;
    })
    .join('');
  return `<ul class="pairs">${rows}</ul>`;
}

const numbered = (items: readonly string[]) =>
  items.map((item, i) => `${i + 1}. ${escapeHtml(item)}`).join('; ');

const PLACEHOLDER_LABEL = {
  transcribing: 'Transcribing',
  blank: 'Blank',
} as const;

function handwritingHtml(line: StudentQuestionLine, cropSrc?: string | null) {
  if (cropSrc) {
    return `<img class="hw" src="${escapeHtml(cropSrc)}" alt="${escapeHtml(`Handwritten answer, question ${line.number}`)}">`;
  }
  return `<div class="hw-missing">${cropSrc === undefined ? 'Loading handwriting' : 'Handwriting unavailable'}</div>`;
}

function notesHtml(
  notes: ReturnType<typeof annotatedSnapshotToHtml>['notes']
): string {
  if (notes.length === 0) return '';
  return `<ol class="notes">${notes
    .map(
      ({ number, annotation }) =>
        `<li value="${number}">${escapeHtml(annotation.comment ?? '')}${
          annotation.rubricCriteria?.length
            ? ` <span class="pts">(${escapeHtml(annotation.rubricCriteria.map((c) => c.name).join(', '))})</span>`
            : ''
        }</li>`
    )
    .join('')}</ol>`;
}

/** The typed answer, handwriting or both for one written line; unchanged for online work. */
function writtenBody(
  line: StudentQuestionLine,
  annotations: NonNullable<StudentQuestionLine['writtenGrade']>['annotations'],
  paper: PaperWrittenPrint | undefined,
  mode: WrittenReturnMode
): { body: string; notes: string } {
  const typed = (): { body: string; notes: string } => {
    if (!line.answerHtml) {
      return {
        body: '<div class="answer"><em>No answer</em></div>',
        notes: '',
      };
    }
    const rendered = annotatedSnapshotToHtml(
      line.answerHtml,
      annotations ?? []
    );
    return {
      body: `<div class="written">${rendered.html}</div>`,
      notes: notesHtml(rendered.notes),
    };
  };
  if (line.recorded) {
    return {
      body: `<div class="answer">[${line.recorded} response]</div>`,
      notes: '',
    };
  }
  if (!paper || !isPaperWrittenAnswer(paper.answer)) return typed();

  const view = paperWrittenView(paper.answer, null, mode);
  const crop =
    view.showCrop || view.cropUnavailable
      ? handwritingHtml(line, view.showCrop ? paper.cropSrc : null)
      : '';
  if (view.placeholder) {
    return {
      body: `${crop}<div class="answer"><em>${PLACEHOLDER_LABEL[view.placeholder]}</em></div>`,
      notes: '',
    };
  }
  if (view.transcript === null) {
    // Handwriting only: highlights still print, as numbered comments under it.
    const rendered = line.answerHtml
      ? annotatedSnapshotToHtml(line.answerHtml, annotations ?? [])
      : null;
    return { body: crop, notes: rendered ? notesHtml(rendered.notes) : '' };
  }
  const text = typed();
  return { body: `${crop}${text.body}`, notes: text.notes };
}

function writtenAnswer(
  line: StudentQuestionLine,
  options: QuizResultsPrintOptions,
  paper?: PaperWrittenPrint,
  mode: WrittenReturnMode = DEFAULT_WRITTEN_RETURN_MODE
): string {
  const grade = line.writtenGrade;
  const feedback = options.showWrittenFeedback;
  const annotations =
    feedback && grade?.annotationUnit !== 'ms'
      ? (grade?.annotations ?? [])
      : [];
  const { body, notes } = writtenBody(line, annotations, paper, mode);
  if (!feedback) return body;
  if (!grade) {
    return line.mark === 'noAnswer'
      ? body
      : `${body}<div class="feedback"><em>Not yet graded</em></div>`;
  }
  const comment = grade.overallComment?.trim()
    ? `<div class="comment"><strong>Teacher comment:</strong> ${escapeHtml(grade.overallComment.trim())}</div>`
    : '';
  const rubric =
    line.rubric && grade.rubricScores?.length
      ? `<table class="rubric">${line.rubric.criteria
          .map((c) => {
            const score = grade.rubricScores?.find(
              (s) => s.criterionId === c.id
            );
            const level = score
              ? c.levels.find((l) => l.id === score.levelId)
              : undefined;
            const cell =
              score && level
                ? `${escapeHtml(level.label)} · ${formatExportPoints(score.points)} pt${score.points === 1 ? '' : 's'}`
                : '<em>not scored</em>';
            const note = score?.note?.trim()
              ? `<div class="pts">${escapeHtml(score.note.trim())}</div>`
              : '';
            return `<tr><td>${escapeHtml(c.name)}${note}</td><td class="pct">${cell}</td></tr>`;
          })
          .join('')}</table>`
      : '';
  const points = `<div class="feedback-pts">Points: ${formatExportPoints(grade.pointsAwarded)} / ${formatExportPoints(line.pointsMax)}</div>`;
  return `${body}${notes}<div class="feedback">${points}${comment}${rubric}</div>`;
}

function answerBlock(
  line: StudentQuestionLine,
  student: ResultsPrintStudent,
  options: QuizResultsPrintOptions,
  writtenMode?: WrittenReturnMode
): string {
  const showKey = keyApplies(line, options.keyMode);
  const keyLine = (label: string, text: string) =>
    showKey ? `<div class="key">${label}: ${text}</div>` : '';
  if (line.manual) {
    return writtenAnswer(
      line,
      options,
      student.paperWritten?.[line.questionId],
      writtenMode
    );
  }
  if (!options.includeQuestions) {
    return `<div class="answer">${line.answerText ? escapeHtml(line.answerText) : '<em>No answer</em>'}</div>${keyLine('Correct answer', escapeHtml(line.correctAnswerText ?? ''))}`;
  }
  if (line.type === 'MC' || line.type === 'MA')
    return mcAnswer(line, student, options, showKey);
  if (line.type === 'Matching') return matchingAnswer(line, options, showKey);
  if (line.type === 'Ordering' && line.order) {
    const given =
      line.order.given.length > 0
        ? numbered(line.order.given)
        : '<em>No answer</em>';
    return `<div class="answer">Your order: ${given}</div>${keyLine('Correct order', numbered(line.order.expected))}`;
  }
  return `<div class="answer">Answer: ${line.answerText ? escapeHtml(line.answerText) : '<em>No answer</em>'}</div>${keyLine('Accepted answer', escapeHtml(line.correctAnswerText ?? ''))}`;
}

function stimulusRow(stimulus: QuizStimulus): string {
  if (stimulus.type === 'image') {
    const src = stimulusMediaUrl(stimulus);
    return src
      ? `<li class="q-stim" data-unit><img src="${escapeHtml(src)}" alt="${escapeHtml(stimulus.label || 'Question picture')}"></li>`
      : '';
  }
  if (stimulus.type === 'text') {
    return `<li class="q-stim" data-unit><div class="passage">${escapeHtml(stimulus.text ?? '')}</div></li>`;
  }
  const label = stimulus.label?.trim();
  return `<li class="q-stim" data-unit><div class="stim-label">${STIMULUS_KIND[stimulus.type]}${label ? `: ${escapeHtml(label)}` : ''} (open it in the quiz)</div></li>`;
}

function studentHeader(
  job: ResultsPrintJob,
  student: ResultsPrintStudent,
  options: QuizResultsPrintOptions
): string {
  const name = student.name
    ? `<p class="student">${escapeHtml(student.name)}</p>`
    : `<p class="student">Name: ______________________________</p><p class="sub">${escapeHtml(
        [student.pin ? `PIN ${student.pin}` : null, student.period]
          .filter(Boolean)
          .join(' · ')
      )}</p>`;
  const meta: string[] = [];
  if (options.showClassDate) {
    if (student.period) meta.push(escapeHtml(student.period));
    meta.push(
      student.drilldown.submittedAt
        ? `Submitted ${formatDate(student.drilldown.submittedAt)}`
        : 'Not submitted yet'
    );
  }
  return `<div class="head" data-unit>${name}<h1>${escapeHtml(job.quizTitle)}</h1>${
    options.showScore
      ? `<p class="score">${escapeHtml(formatScore(student))}</p>`
      : ''
  }${meta.length ? `<p class="sub">${meta.join(' · ')}</p>` : ''}</div>`;
}

function studentReport(
  job: ResultsPrintJob,
  student: ResultsPrintStudent,
  options: QuizResultsPrintOptions
): string {
  const stimuliById = new Map(job.stimuli.map((s) => [s.id, s]));
  const printed = new Set<string>();
  const missedOnly = options.questionScope === 'missed';
  const lines = missedOnly
    ? student.drilldown.lines.filter((line) => MISSED_MARKS.has(line.mark))
    : student.drilldown.lines;
  const rows = lines
    .map((line) => {
      let stim = '';
      if (options.includeStimuli) {
        for (const id of line.stimulusIds ?? []) {
          const s = stimuliById.get(id);
          if (!s || printed.has(id)) continue;
          printed.add(id);
          stim += stimulusRow(s);
        }
      }
      const text = options.includeQuestions
        ? `<div class="text">${escapeHtml(line.text)}</div>`
        : '';
      return `${stim}<li data-unit><span class="qn">${line.number}.</span><div>${text}${answerBlock(line, student, options, job.writtenMode)}</div>${markCell(line, options)}</li>`;
    })
    .join('');
  const questions =
    lines.length > 0
      ? `${missedOnly ? '<h2 class="scope" data-unit>Questions to review</h2>' : ''}<ol class="q">${rows}</ol>`
      : `<p class="sub" data-unit>${
          missedOnly && student.drilldown.lines.length > 0
            ? 'No missed questions.'
            : 'No questions were served to this student yet.'
        }</p>`;

  const targets =
    options.showTargets && student.targets.length > 0
      ? `<div class="targets" data-unit><h2>Learning targets</h2><table>${student.targets
          .map(
            (t) =>
              `<tr><td>${escapeHtml(t.label)}</td><td class="pct">${
                t.percent === null ? '—' : `${t.percent}%`
              }${t.band ? ` · ${escapeHtml(BAND_LABEL[t.band] ?? t.band)}` : ''}</td></tr>`
          )
          .join('')}</table></div>`
      : '';
  const commentBox = options.showCommentBox
    ? `<div class="comment-box" data-unit><p>Teacher comments</p>${'<div class="rule"></div>'.repeat(5)}</div>`
    : '';

  return `${studentHeader(job, student, options)}${questions}${targets}${commentBox}`;
}

function separatorPage(
  job: ResultsPrintJob,
  period: string | null,
  count: number
): string {
  return `<section class="block sep" data-print-block="separator"><p class="sep-period">${escapeHtml(period ?? NO_PERIOD_LABEL)}</p><p class="sep-title">${escapeHtml(job.quizTitle)}</p><p class="sep-count">${count} student${count === 1 ? '' : 's'}</p></section><div class="pad" aria-hidden="true"></div>`;
}

/** Crop, points and comment for each written box on a reprint (D42). */
export function writtenSheetFill(
  student: Pick<ResultsPrintStudent, 'drilldown' | 'paperWritten'>,
  reprint: Pick<SheetReprint, 'writtenTexts'>,
  options: Pick<QuizResultsPrintOptions, 'markAnswers' | 'showWrittenFeedback'>
): Record<string, SheetWrittenFill> | undefined {
  if (!reprint.writtenTexts) return undefined;
  const lines = new Map(
    student.drilldown.lines.map((line) => [line.questionId, line])
  );
  const out: Record<string, SheetWrittenFill> = {};
  for (const questionId of Object.keys(reprint.writtenTexts)) {
    const paper = student.paperWritten?.[questionId];
    if (!paper) continue;
    const line = lines.get(questionId);
    const fill: SheetWrittenFill =
      paper.cropSrc === undefined ? {} : { crop: paper.cropSrc };
    if (options.markAnswers && line && line.mark !== 'excused') {
      fill.points =
        line.mark === 'ungraded'
          ? 'Not graded'
          : `${formatExportPoints(line.pointsEarned)}/${formatExportPoints(line.pointsMax)}`;
    }
    const comment = line?.writtenGrade?.overallComment?.trim();
    if (options.showWrittenFeedback && comment) fill.comment = comment;
    out[questionId] = fill;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sheetReprintHtml(
  job: ResultsPrintJob,
  student: ResultsPrintStudent,
  reprint: SheetReprint,
  options: QuizResultsPrintOptions
): string {
  const written = writtenSheetFill(student, reprint, options);
  return buildFilledSheetHtml(
    {
      seat: reprint.seat,
      student: null,
      displayName: student.name ?? 'Name ______________________',
      className: student.period ?? '',
      isKeySheet: false,
    },
    {
      batchId: reprint.batchId,
      quizTitle: job.quizTitle,
      questionCount: reprint.questionCount,
      choiceCount: reprint.choiceCount,
      columnsPerPage: reprint.columnsPerPage,
      ...(reprint.questionTexts
        ? { questionTexts: reprint.questionTexts }
        : {}),
      ...(reprint.pageMaps
        ? { pageMaps: reprint.pageMaps, writtenTexts: reprint.writtenTexts }
        : {}),
    },
    reprint.pageCount,
    sheetFillFor(reprint, {
      markAnswers: options.markAnswers,
      keyMode: options.keyMode,
      ...(options.showScore ? { score: formatScore(student) } : {}),
      ...(written ? { written } : {}),
    })
  );
}

/** The body of the print: a separator before each period when there are several, then one section per student. */
export function buildResultsPrintHtml(
  job: ResultsPrintJob,
  options: QuizResultsPrintOptions
): string {
  const students = sortResultsPrintStudents(job.students, job.periodOrder);
  const periods = new Set(students.map((s) => s.period));
  const separate = periods.size > 1;
  const counts = new Map<string | null, number>();
  for (const s of students)
    counts.set(s.period, (counts.get(s.period) ?? 0) + 1);

  let lastPeriod: string | null | undefined;
  return students
    .map((student) => {
      let sep = '';
      if (separate && student.period !== lastPeriod) {
        sep = separatorPage(
          job,
          student.period,
          counts.get(student.period) ?? 0
        );
      }
      lastPeriod = student.period;
      const key = escapeHtml(student.key);
      const sheet =
        options.layout !== 'report' && student.sheet
          ? `<section class="block sheet-set" data-print-block="sheet" data-pages="${student.sheet.pageCount}" data-student="${key}">${sheetReprintHtml(job, student, student.sheet, options)}</section>`
          : '';
      const report =
        !sheet || options.layout === 'both'
          ? `<section class="block stu" data-print-block="student" data-student="${key}">${studentReport(job, student, options)}</section>`
          : '';
      return `${sep}${sheet}${report}`;
    })
    .join('');
}

const PRINT_WIDTH_MM = 215.9 - 36;
const PRINT_HEIGHT_MM = 279.4 - 32;
const PX_PER_MM = 96 / 25.4;

export const RESULTS_PRINT_STYLES = `
  @page { size: letter; margin: 16mm 18mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10.5pt; }
  .block + .block, .pad + .block { break-before: page; }
  .pad { break-before: page; height: 1px; }
  h1 { font-size: 13pt; margin: 0 0 1mm; }
  .student { font-size: 14pt; font-weight: bold; margin: 0 0 1mm; }
  .sub { margin: 0 0 1mm; color: #333; }
  .score { font-weight: bold; margin: 1mm 0; }
  .head { margin-bottom: 4mm; }
  h2 { font-size: 11pt; margin: 5mm 0 2mm; }
  ol.q { list-style: none; padding: 0; margin: 0; }
  ol.q > li { break-inside: avoid; border-top: 1px solid #bbb; padding: 2mm 0; display: grid; grid-template-columns: 8mm 1fr auto; gap: 2mm; }
  ol.q > li.q-stim { display: block; }
  .qn { font-weight: bold; }
  .text { white-space: pre-wrap; margin-bottom: 1mm; }
  .answer { white-space: pre-wrap; }
  .key { margin-top: 0.5mm; font-style: italic; }
  .keytag { font-weight: bold; font-style: italic; border: 1px solid #000; padding: 0 1mm; }
  .mark { text-align: right; white-space: nowrap; font-weight: bold; }
  .pts { font-weight: normal; color: #444; }
  .tick { font-weight: bold; }
  ul.opts, ul.pairs { list-style: none; padding: 0; margin: 0; }
  li.opt { padding: 0.3mm 0; }
  li.opt.picked { font-weight: bold; }
  .bullet { display: inline-block; width: 4mm; }
  .letter { font-weight: bold; }
  .written p { margin: 0 0 1.5mm; }
  mark.hl { color: inherit; text-decoration: underline; }
  .hl-yellow { background: #fde68a; }
  .hl-green { background: #a7f3d0; }
  .hl-pink { background: #fbcfe8; }
  .hl-blue { background: #bae6fd; }
  sup.fn { font-weight: bold; }
  ol.notes { margin: 1mm 0 0; padding-left: 6mm; font-size: 9.5pt; }
  .feedback { margin-top: 1.5mm; }
  .feedback-pts { font-weight: bold; }
  .comment { margin-top: 1mm; white-space: pre-wrap; }
  table { border-collapse: collapse; width: 100%; }
  td { border-top: 1px solid #ccc; padding: 1.2mm 0; vertical-align: top; }
  td.pct { text-align: right; white-space: nowrap; padding-left: 3mm; }
  table.rubric { margin-top: 1mm; }
  img.hw { display: block; max-width: 100%; max-height: 120mm; margin: 1mm 0; border: 1px solid #bbb; }
  .hw-missing { margin: 1mm 0; padding: 3mm; border: 1px dashed #666; font-style: italic; color: #333; }
  .q-stim img { display: block; max-width: 100%; max-height: 110mm; margin: 0 auto; }
  .passage { white-space: pre-wrap; border: 1px solid #999; padding: 2mm; }
  .stim-label { font-style: italic; }
  .targets, .comment-box { break-inside: avoid; }
  .comment-box { margin-top: 5mm; border: 1px solid #000; padding: 2mm 3mm 3mm; }
  .comment-box p { margin: 0 0 1mm; font-weight: bold; }
  .rule { border-bottom: 1px solid #999; height: 8mm; }
  .sep { text-align: center; padding-top: 70mm; }
  .sep-period { font-size: 24pt; font-weight: bold; margin: 0 0 4mm; }
  .sep-title { font-size: 14pt; margin: 0 0 2mm; }
  .sep-count { margin: 0; }
${SHEET_REPRINT_STYLES}`;

/**
 * Pages one block takes, found by laying its units out a page at a time so a
 * unit that `break-inside: avoid` pushes to the next page is counted.
 */
export function countPrintedPages(block: Element, pageHeight: number): number {
  const origin = block.getBoundingClientRect().top;
  let shift = 0;
  let pageStart = 0;
  let end = 0;
  for (const unit of Array.from(block.querySelectorAll('[data-unit]'))) {
    const rect = unit.getBoundingClientRect();
    let top = rect.top - origin + shift;
    while (top >= pageStart + pageHeight) pageStart += pageHeight;
    if (
      top > pageStart &&
      rect.height <= pageHeight &&
      top + rect.height > pageStart + pageHeight
    ) {
      const push = pageStart + pageHeight - top;
      shift += push;
      top += push;
      pageStart += pageHeight;
    }
    end = Math.max(end, top + rect.height);
  }
  return Math.max(1, Math.ceil((end - 0.5) / pageHeight));
}

/** Adds a blank page after each student whose pages come out odd, so double-sided stacks stay aligned (D20). */
export function padBlocksForDuplex(doc: Document): void {
  const body = doc.body;
  const previousWidth = body.style.width;
  body.style.width = `${PRINT_WIDTH_MM}mm`;
  const blocks = Array.from(doc.querySelectorAll('[data-print-block]'));
  const pageHeight = PRINT_HEIGHT_MM * PX_PER_MM;
  const counts = blocks.map((b) => {
    const kind = b.getAttribute('data-print-block');
    if (kind === 'sheet') return Number(b.getAttribute('data-pages')) || 1;
    return kind === 'student' ? countPrintedPages(b, pageHeight) : 0;
  });
  body.style.width = previousWidth;
  // A student's sheet and report are one hand-back: pad after the pair.
  let total = 0;
  blocks.forEach((block, i) => {
    const student = block.getAttribute('data-student');
    total += counts[i];
    const next = blocks[i + 1];
    if (student && next?.getAttribute('data-student') === student) return;
    const odd = total % 2 === 1;
    total = 0;
    if (!next || !student || !odd) return;
    const pad = doc.createElement('div');
    pad.className = 'pad';
    pad.setAttribute('aria-hidden', 'true');
    block.after(pad);
  });
}

/** The whole document, for the modal's preview iframe. */
export function buildResultsPreviewDocument(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${RESULTS_PRINT_STYLES}
  body { padding: 12mm 14mm; background: #fff; }
  .pad, .sep + .pad { display: none; }
</style></head><body>${body}</body></html>`;
}

export function printQuizResults(
  job: ResultsPrintJob,
  options: QuizResultsPrintOptions,
  openWindow?: OpenWindow
): void {
  const body = buildResultsPrintHtml(job, options);
  printHtmlDocument(
    {
      title: job.quizTitle,
      styles: RESULTS_PRINT_STYLES,
      body,
      awaitImages: body.includes('<img'),
      beforePrint: options.duplexPadding
        ? (win) => padBlocksForDuplex(win.document)
        : undefined,
    },
    openWindow
  );
}
