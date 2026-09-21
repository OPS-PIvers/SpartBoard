import {
  escapeHtml,
  printHtmlDocument,
  type OpenWindow,
} from './printHtmlDocument';
import type { StudentOutcome } from './quizQuestionDrilldown';
import type { StudentDrilldown } from './quizStudentDrilldown';
import { formatExportPoints } from './assignmentExportShared';

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
};

const BAND_LABEL: Record<string, string> = {
  proficient: 'Proficient',
  approaching: 'Approaching',
  beginning: 'Beginning',
};

const STYLES = `
  @page { size: letter; margin: 16mm 18mm; }
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
        job.includeCorrectAnswers && line.correctAnswerText
          ? `<div class="key">Correct answer: ${escapeHtml(line.correctAnswerText)}</div>`
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
    },
    openWindow
  );
}
