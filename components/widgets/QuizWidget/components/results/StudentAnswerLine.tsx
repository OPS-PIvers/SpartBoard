import React from 'react';
import {
  CheckCircle2,
  Circle,
  CircleSlash,
  Clock,
  MinusCircle,
  Pencil,
  XCircle,
} from 'lucide-react';
import {
  showsMissedKey,
  type StudentQuestionLine,
} from '@/utils/quizStudentDrilldown';
import { MARK_LABEL } from '@/utils/quizStudentReportPrint';
import { formatExportPoints } from '@/utils/assignmentExportShared';

const SMALL_TEXT = { fontSize: 'min(11px, 3.8cqmin)' } as const;
const BODY_TEXT = { fontSize: 'min(12px, 4cqmin)' } as const;
const SMALL_ICON = {
  width: 'min(12px, 3.8cqmin)',
  height: 'min(12px, 3.8cqmin)',
} as const;

const MARK_STYLE: Record<
  StudentQuestionLine['mark'],
  { icon: typeof CheckCircle2; className: string }
> = {
  correct: { icon: CheckCircle2, className: 'text-emerald-700' },
  partial: { icon: MinusCircle, className: 'text-amber-700' },
  incorrect: { icon: XCircle, className: 'text-brand-red-primary' },
  ungraded: { icon: Clock, className: 'text-amber-700' },
  excused: { icon: CircleSlash, className: 'text-brand-gray-primary' },
  noAnswer: { icon: Circle, className: 'text-brand-gray-primary' },
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div
    className="grid"
    style={{
      gridTemplateColumns: 'min(96px, 26cqmin) minmax(0, 1fr)',
      gap: 'min(8px, 2cqmin)',
    }}
  >
    <dt className="font-sans text-brand-gray-primary" style={SMALL_TEXT}>
      {label}
    </dt>
    <dd
      className="font-sans text-brand-gray-darkest whitespace-pre-wrap break-words min-w-0"
      style={BODY_TEXT}
    >
      {children}
    </dd>
  </div>
);

function answerLabel(line: StudentQuestionLine): string {
  if (line.recorded)
    return `${line.recorded === 'audio' ? 'Audio' : 'Video'} recording`;
  return line.answerText;
}

/** One question in the expanded student row, laid out like the printed report. */
export const StudentAnswerLine: React.FC<{
  line: StudentQuestionLine;
  onOpenGrader?: () => void;
  /** Teacher comment and rubric levels under a written answer. */
  showFeedback?: boolean;
}> = ({ line, onOpenGrader, showFeedback = false }) => {
  const { icon: MarkIcon, className } = MARK_STYLE[line.mark];
  const answer = answerLabel(line);
  const grade = showFeedback ? line.writtenGrade : undefined;
  const comment = grade?.overallComment?.trim();
  const rubricRows =
    line.rubric && grade?.rubricScores?.length
      ? line.rubric.criteria.map((c) => {
          const score = grade.rubricScores?.find((s) => s.criterionId === c.id);
          const level = score
            ? c.levels.find((l) => l.id === score.levelId)
            : undefined;
          return {
            id: c.id,
            name: c.name,
            value:
              score && level
                ? `${level.label} · ${formatExportPoints(score.points)} pt${score.points === 1 ? '' : 's'}`
                : 'Not scored',
          };
        })
      : [];

  return (
    <li
      className="border-t border-brand-gray-lightest"
      style={{ paddingTop: 'min(8px, 2cqmin)' }}
    >
      <div className="flex items-start" style={{ gap: 'min(8px, 2cqmin)' }}>
        <span
          className="font-sans font-semibold text-brand-blue-primary tabular-nums shrink-0"
          style={BODY_TEXT}
        >
          Q{line.number}
        </span>
        <p
          className="font-sans font-medium text-brand-gray-darkest flex-1 min-w-0 break-words"
          style={BODY_TEXT}
        >
          {line.text}
        </p>
        {onOpenGrader && (
          <button
            type="button"
            onClick={onOpenGrader}
            aria-label={`Grade Q${line.number}: ${line.text}`}
            className="inline-flex items-center shrink-0 rounded font-sans font-semibold text-brand-blue-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
            style={{ ...SMALL_TEXT, gap: 'min(3px, 0.8cqmin)' }}
          >
            <Pencil aria-hidden style={SMALL_ICON} />
            Grade
          </button>
        )}
        <span
          className={`flex items-center font-sans font-semibold shrink-0 ${className}`}
          style={{ ...SMALL_TEXT, gap: 'min(4px, 1cqmin)' }}
        >
          <MarkIcon aria-hidden style={SMALL_ICON} />
          {MARK_LABEL[line.mark]}
        </span>
        {line.mark !== 'excused' && (
          <span
            className="font-sans text-brand-gray-dark tabular-nums shrink-0 text-right"
            style={{ ...SMALL_TEXT, minWidth: 'min(32px, 9cqmin)' }}
          >
            {formatExportPoints(line.pointsEarned)}/
            {formatExportPoints(line.pointsMax)}
          </span>
        )}
      </div>
      <dl
        className="flex flex-col"
        style={{
          gap: 'min(3px, 0.8cqmin)',
          marginTop: 'min(4px, 1cqmin)',
          paddingLeft: 'min(24px, 6cqmin)',
        }}
      >
        <Field label="Answer">
          {answer || (
            <span className="italic text-brand-gray-primary">No answer</span>
          )}
        </Field>
        {showsMissedKey(line) && (
          <Field label="Correct answer">{line.correctAnswerText}</Field>
        )}
        {comment && <Field label="Comment">{comment}</Field>}
        {rubricRows.map((row) => (
          <Field key={row.id} label={row.name}>
            {row.value}
          </Field>
        ))}
      </dl>
    </li>
  );
};
