import React from 'react';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { SCORE_DISTRIBUTION_BANDS } from '@/utils/scoreColor';

const headerIcon = {
  width: 'min(16px, 5cqmin)',
  height: 'min(16px, 5cqmin)',
};
const footerIcon = {
  width: 'min(14px, 4.5cqmin)',
  height: 'min(14px, 4.5cqmin)',
};
const sectionLabel =
  'font-sans font-semibold text-brand-blue-primary uppercase tracking-wider';

/** Blue results header in the Quiz results layout (monitor-parity). */
export const ParityHeader: React.FC<{
  title: string;
  status: string;
  onBack: () => void;
  backAnchor: TourAnchorAttrs;
  actions?: React.ReactNode;
}> = ({ title, status, onBack, backAnchor, actions }) => (
  <div
    className="flex items-center bg-brand-blue-primary text-white shrink-0"
    style={{
      gap: 'min(8px, 2cqmin)',
      padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
    }}
  >
    <button
      type="button"
      onClick={onBack}
      aria-label="Back"
      {...backAnchor}
      className="relative touch-target-expand rounded-md hover:bg-white/15 transition-colors"
      style={{ padding: 'min(4px, 1cqmin)' }}
    >
      <ArrowLeft style={headerIcon} />
    </button>
    <p
      className="font-sans font-semibold truncate flex-1"
      style={{ fontSize: 'min(14px, 5cqmin)' }}
    >
      {title}
    </p>
    {actions}
    <span
      className="shrink-0 rounded-full font-sans font-semibold uppercase tracking-wider bg-white/20 text-white"
      style={{
        fontSize: 'min(10px, 3.5cqmin)',
        padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
      }}
    >
      {status}
    </span>
  </div>
);

const DrillRow: React.FC<{
  label: string;
  detail: string;
  onClick: () => void;
  anchor: TourAnchorAttrs;
}> = ({ label, detail, onClick, anchor }) => (
  <button
    type="button"
    onClick={onClick}
    {...anchor}
    className="flex items-center justify-between bg-white border border-brand-gray-lighter rounded-lg hover:border-brand-blue-light transition-colors text-left"
    style={{
      padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
      gap: 'min(8px, 2cqmin)',
    }}
  >
    <p
      className="font-sans font-semibold text-brand-gray-dark truncate"
      style={{ fontSize: 'min(13px, 4.5cqmin)' }}
    >
      {label}
    </p>
    <span
      className="flex items-center shrink-0 text-brand-gray-primary"
      style={{ gap: 'min(6px, 1.5cqmin)', fontSize: 'min(11px, 3.8cqmin)' }}
    >
      {detail}
      <ChevronRight
        className="text-brand-gray-light"
        aria-hidden
        style={footerIcon}
      />
    </span>
  </button>
);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Class average, score distribution and the two drill-down rows. */
export const ParityOverview: React.FC<{
  avgScore: number | null;
  completed: number;
  total: number;
  /** Percent scores of the completed responses that can be scored. */
  scores: number[];
  questionCount: number;
  onOpenQuestions: () => void;
  onOpenStudents: () => void;
  anchors: { questions: TourAnchorAttrs; students: TourAnchorAttrs };
}> = ({
  avgScore,
  completed,
  total,
  scores,
  questionCount,
  onOpenQuestions,
  onOpenStudents,
  anchors,
}) => (
  <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
    <div
      className="bg-brand-blue-lighter rounded-lg"
      style={{ padding: 'min(12px, 3cqmin)' }}
    >
      <p className={sectionLabel} style={{ fontSize: 'min(10px, 3.5cqmin)' }}>
        Class average
      </p>
      <p
        className="font-sans font-bold text-brand-blue-dark tabular-nums"
        style={{ fontSize: 'min(26px, 10cqmin)', lineHeight: 1.15 }}
      >
        {avgScore === null ? '—' : `${avgScore}%`}
      </p>
      <p
        className="text-brand-blue-dark/70"
        style={{ fontSize: 'min(11px, 3.8cqmin)' }}
      >
        {completed} of {total} students finished
      </p>
    </div>

    <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
      <p className={sectionLabel} style={{ fontSize: 'min(10px, 3.5cqmin)' }}>
        Score distribution
      </p>
      {SCORE_DISTRIBUTION_BANDS.map((b) => {
        const count = scores.filter((s) => s >= b.min && s <= b.max).length;
        const pct =
          scores.length > 0 ? Math.round((count / scores.length) * 100) : 0;
        return (
          <div key={b.label}>
            <div
              className="flex items-center justify-between"
              style={{
                gap: 'min(8px, 2cqmin)',
                marginBottom: 'min(2px, 0.5cqmin)',
              }}
            >
              <span
                className="font-sans text-brand-gray-dark"
                style={{ fontSize: 'min(12px, 4cqmin)' }}
              >
                {b.label}
              </span>
              <span
                className="text-brand-gray-primary tabular-nums shrink-0"
                style={{ fontSize: 'min(11px, 3.8cqmin)' }}
              >
                {count} · {pct}%
              </span>
            </div>
            <div
              className="bg-brand-gray-lightest rounded-full overflow-hidden"
              style={{ height: 'min(8px, 2cqmin)' }}
            >
              <div
                className={`h-full rounded-full ${b.color}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>

    <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
      <DrillRow
        label="Question results"
        detail={plural(questionCount, 'question')}
        onClick={onOpenQuestions}
        anchor={anchors.questions}
      />
      <DrillRow
        label="Students"
        detail={plural(total, 'student')}
        onClick={onOpenStudents}
        anchor={anchors.students}
      />
    </div>
  </div>
);

const footerButtonClass =
  'inline-flex items-center whitespace-nowrap bg-white border border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light font-sans font-semibold rounded-md transition-colors disabled:opacity-60';
const footerPrimaryClass =
  'inline-flex items-center whitespace-nowrap bg-brand-blue-primary hover:bg-brand-blue-light text-white font-sans font-semibold rounded-md transition-colors disabled:opacity-60';
const footerButtonStyle = {
  gap: 'min(6px, 1.5cqmin)',
  padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
  fontSize: 'min(13px, 4.5cqmin)',
};

/** A footer button that swaps its icon for a spinner while busy. */
export const FooterButton: React.FC<{
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  anchor: TourAnchorAttrs;
  primary?: boolean;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
}> = ({
  label,
  icon: Icon,
  onClick,
  anchor,
  primary,
  busy,
  disabled,
  title,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    {...anchor}
    className={primary ? footerPrimaryClass : footerButtonClass}
    style={footerButtonStyle}
  >
    {busy ? (
      <Loader2 aria-hidden className="animate-spin" style={footerIcon} />
    ) : (
      <Icon
        aria-hidden
        className={primary ? undefined : 'text-brand-blue-primary'}
        style={footerIcon}
      />
    )}
    {label}
  </button>
);
