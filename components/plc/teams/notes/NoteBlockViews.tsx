// Presentational Data, Decision and agenda blocks for a meeting note (TEAMS_REDESIGN T13, T14, T24).

import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Link2, Scale, Trash2, X } from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import type { ItemAnalysisQuestion } from '@/utils/plcDataOverview';
import { ItemAnalysisLegend } from '@/components/plc/redesignMockup/charts/ItemAnalysisChart';
import { META, Row, TextLink } from '@/components/plc/redesignMockup/ui';
import { NoteItemAnalysisChart } from './NoteItemAnalysisChart';

const BLOCK = 'rounded-xl border border-slate-200 p-4';

export interface SelectGroup {
  label: string;
  options: { value: string; label: string }[];
}

/** A native select that reads as a quiet text link. */
export const QuietSelect: React.FC<{
  label: string;
  value: string;
  groups: SelectGroup[];
  noneLabel?: string;
  onChange: (value: string) => void;
}> = ({ label, value, groups, noneLabel, onChange }) => (
  <select
    aria-label={label}
    title={label}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="max-w-[16rem] truncate rounded-md border-0 bg-transparent py-0.5 pl-1 pr-6 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
  >
    {noneLabel !== undefined && <option value="">{noneLabel}</option>}
    {groups.map((g) =>
      g.label ? (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ) : (
        g.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))
      )
    )}
  </select>
);

export interface DataBlockViewProps {
  title: string | null;
  teamAveragePercent: number | null;
  scoredStudents: number | null;
  totalStudents: number;
  questions: ItemAnalysisQuestion[];
  onOpenData?: () => void;
  /** Editors: switch the assessment. */
  picker?: React.ReactNode;
  onRemove?: () => void;
}

export const DataBlockView: React.FC<DataBlockViewProps> = ({
  title,
  teamAveragePercent,
  scoredStudents,
  totalStudents,
  questions,
  onOpenData,
  picker,
  onRemove,
}) => {
  const { t } = useTranslation();
  return (
    <div className={BLOCK}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <BarChart3
          className="h-4 w-4 text-brand-blue-primary"
          aria-hidden="true"
        />
        {picker ??
          (title && (
            <span className="text-sm font-bold text-slate-800">{title}</span>
          ))}
        {teamAveragePercent !== null && (
          <span className={META}>
            {t('teams.notes.data.live', {
              defaultValue:
                'Live · team average {{pct}}% · {{scored}} of {{total}}',
              pct: teamAveragePercent,
              scored: scoredStudents ?? '–',
              total: totalStudents,
            })}
          </span>
        )}
        <span className="flex-1" />
        {onOpenData && (
          <TextLink onClick={onOpenData}>
            {t('teams.notes.data.open', {
              defaultValue: 'Open in Data overview',
            })}
          </TextLink>
        )}
        {onRemove && (
          <IconButton
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label={t('teams.notes.block.remove', {
              defaultValue: 'Remove block',
            })}
            size="sm"
            onClick={onRemove}
          />
        )}
      </div>
      {questions.length > 0 ? (
        <>
          <div className="mb-2">
            <ItemAnalysisLegend />
          </div>
          <NoteItemAnalysisChart questions={questions} />
        </>
      ) : (
        <p className={META}>
          {t('teams.notes.data.none', {
            defaultValue: 'No results yet.',
          })}
        </p>
      )}
    </div>
  );
};

export interface DecisionBlockViewProps {
  text: string;
  /** Decided date, or the open label. */
  dateLabel: string;
  linkLabel?: string | null;
  linkDetail?: string | null;
  onOpenLink?: () => void;
  revisitLabel?: string | null;
  /** Editors only. */
  edit?: {
    onText: (text: string) => void;
    statusAction: { label: string; run: () => void };
    linkPicker: React.ReactNode;
    revisitAt: string;
    onRevisit: (value: string) => void;
    onRemove: () => void;
  };
}

export const DecisionBlockView: React.FC<DecisionBlockViewProps> = ({
  text,
  dateLabel,
  linkLabel,
  linkDetail,
  onOpenLink,
  revisitLabel,
  edit,
}) => {
  const { t } = useTranslation();
  const dateRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`flex gap-3 ${BLOCK}`}>
      <Scale
        className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">
            {t('teams.notes.decision.title', { defaultValue: 'Decision' })}
          </span>
          <span className={META}>{dateLabel}</span>
          <span className="flex-1" />
          {edit && (
            <>
              <TextLink quiet onClick={edit.statusAction.run}>
                {edit.statusAction.label}
              </TextLink>
              <IconButton
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label={t('teams.notes.block.remove', {
                  defaultValue: 'Remove block',
                })}
                size="sm"
                onClick={edit.onRemove}
              />
            </>
          )}
        </p>
        {edit ? (
          <textarea
            value={text}
            onChange={(e) => edit.onText(e.target.value)}
            rows={1}
            aria-label={t('teams.notes.decision.title', {
              defaultValue: 'Decision',
            })}
            className="mt-1 block w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-slate-700 [field-sizing:content] focus:outline-none focus:ring-0"
          />
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
            {text}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {edit ? (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              {edit.linkPicker}
            </span>
          ) : (
            linkLabel &&
            (onOpenLink ? (
              <TextLink icon={Link2} onClick={onOpenLink}>
                {linkLabel}
              </TextLink>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                {linkLabel}
              </span>
            ))
          )}
          {linkDetail && <span className="text-slate-500">{linkDetail}</span>}
          {edit ? (
            <span className="relative inline-flex items-center gap-1 text-slate-500">
              <button
                type="button"
                onClick={() => {
                  try {
                    dateRef.current?.showPicker();
                  } catch {
                    dateRef.current?.focus();
                  }
                }}
                className="rounded hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
              >
                {revisitLabel ??
                  t('teams.notes.decision.revisitPick', {
                    defaultValue: 'Revisit date',
                  })}
              </button>
              {revisitLabel && (
                <button
                  type="button"
                  aria-label={t('teams.notes.decision.clearRevisit', {
                    defaultValue: 'Clear revisit date',
                  })}
                  onClick={() => edit.onRevisit('')}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
              <input
                ref={dateRef}
                type="date"
                tabIndex={-1}
                aria-hidden
                value={edit.revisitAt}
                onChange={(e) => edit.onRevisit(e.target.value)}
                className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
              />
            </span>
          ) : (
            revisitLabel && (
              <span className="text-slate-500">{revisitLabel}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
};

/** One agenda item row: text, and who added it. */
export const AgendaRow: React.FC<{
  text: string;
  who: string;
  onRemove?: () => void;
}> = ({ text, who, onRemove }) => {
  const { t } = useTranslation();
  return (
    <Row
      title={text}
      trailing={
        <span className="flex shrink-0 items-center gap-1">
          <span className={META}>{who}</span>
          {onRemove && (
            <button
              type="button"
              aria-label={t('teams.notes.agenda.remove', {
                defaultValue: 'Remove agenda item',
              })}
              title={t('teams.notes.agenda.remove', {
                defaultValue: 'Remove agenda item',
              })}
              onClick={onRemove}
              className="rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      }
    />
  );
};
