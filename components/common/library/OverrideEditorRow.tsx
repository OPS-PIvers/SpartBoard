/**
 * OverrideEditorRow — per-selected-student accommodation row for the M17
 * individual-assignment override editor (spec §5 B2, Decision 16).
 *
 * Collapsed: a chip strip summarizing the student's active overrides.
 * Expanded: a compact grid of controls — time multiplier, tab-warning
 * threshold, per-student window shift, and (quiz only) question subset,
 * per-question MC-option hider, and rubric swap. Emits a `StudentOverride`
 * via `onChange`; the parent (B1 picker / B3 assign flow) owns persistence.
 *
 * Reference cloned: `RubricScoringPanel`/`RubricBuilderPanel` (M12) for the
 * per-criterion/per-question row layout and light-surface card treatment.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Copy } from 'lucide-react';
import type { Rubric, StudentOverride } from '@/types';
import { summarizeOverride } from '@/utils/studentOverrideSummary';

export interface OverrideEditorQuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

/** A question the override editor can target. `options` present ⇒ MC (hider applies); absent ⇒ written (rubric swap applies). */
export interface OverrideEditorQuestion {
  id: string;
  label: string;
  options?: OverrideEditorQuestionOption[];
}

export interface OverrideEditorPeer {
  id: string;
  name: string;
  override: StudentOverride;
}

export interface OverrideEditorRowProps {
  studentName: string;
  override: StudentOverride;
  onChange: (next: StudentOverride) => void;
  /** Quiz-only fields (subset picker, option hider, rubric swap, tab warning) render only when true. */
  quizMode?: boolean;
  questions?: OverrideEditorQuestion[];
  rubrics?: Rubric[];
  /** Other selected students eligible for "Copy overrides from". */
  peers?: OverrideEditorPeer[];
  defaultExpanded?: boolean;
}

const TIME_MULTIPLIER_OPTIONS: Array<{
  label: string;
  value: StudentOverride['timeMultiplier'];
}> = [
  { label: 'None', value: undefined },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
  { label: 'Unlimited', value: 'unlimited' },
];

/** ms epoch <-> `<input type="datetime-local">` value (local time, no seconds). */
const msToLocalInputValue = (ms: number | undefined): string => {
  if (!ms) return '';
  const d = new Date(ms);
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(ms - tzOffsetMs).toISOString().slice(0, 16);
};
const localInputValueToMs = (value: string): number | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const OverrideEditorRow: React.FC<OverrideEditorRowProps> = ({
  studentName,
  override,
  onChange,
  quizMode = false,
  questions = [],
  rubrics = [],
  peers = [],
  defaultExpanded = false,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copySourceId, setCopySourceId] = useState('');

  const totalQuestions = quizMode ? questions.length : undefined;
  const chips = summarizeOverride(override, { totalQuestions });

  const patch = (next: Partial<StudentOverride>) =>
    onChange({ ...override, ...next });

  const handleCopy = () => {
    const source = peers.find((p) => p.id === copySourceId);
    if (!source) return;
    // Deep clone so the two rows never share nested references.
    onChange(JSON.parse(JSON.stringify(source.override)) as StudentOverride);
  };

  const isQuestionIncluded = (qId: string) =>
    !override.questionIds || override.questionIds.includes(qId);

  const toggleQuestion = (qId: string) => {
    const base = override.questionIds ?? questions.map((q) => q.id);
    const next = base.includes(qId)
      ? base.filter((id) => id !== qId)
      : [...base, qId];
    patch({ questionIds: next.length === questions.length ? undefined : next });
  };

  const toggleHiddenOption = (
    question: OverrideEditorQuestion,
    option: OverrideEditorQuestionOption
  ) => {
    // Never allow hiding the correct answer — enforced here regardless of UI state.
    if (option.isCorrect) return;
    const current = override.hiddenOptionIdsByQuestion ?? {};
    const forQuestion = current[question.id] ?? [];
    const nextForQuestion = forQuestion.includes(option.id)
      ? forQuestion.filter((id) => id !== option.id)
      : [...forQuestion, option.id];
    const nextMap = { ...current };
    if (nextForQuestion.length === 0) delete nextMap[question.id];
    else nextMap[question.id] = nextForQuestion;
    patch({
      hiddenOptionIdsByQuestion:
        Object.keys(nextMap).length > 0 ? nextMap : undefined,
    });
  };

  const setRubricOverride = (
    questionId: string,
    value: Rubric | 'points' | undefined
  ) => {
    const current = { ...(override.rubricOverrideByQuestion ?? {}) };
    if (value === undefined) delete current[questionId];
    else current[questionId] = value;
    patch({
      rubricOverrideByQuestion:
        Object.keys(current).length > 0 ? current : undefined,
    });
  };

  const writtenQuestions = questions.filter((q) => !q.options);
  const mcQuestions = questions.filter((q) => !!q.options);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900 truncate">
            {studentName}
          </span>
          {chips.length > 0 ? (
            <span className="flex flex-wrap gap-1 mt-1">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center rounded-full bg-brand-blue-lighter/30 px-2 py-0.5 text-xs font-semibold text-brand-blue-dark"
                >
                  {chip}
                </span>
              ))}
            </span>
          ) : (
            <span className="block text-xs text-slate-500 mt-0.5">
              {t('studentOverride.noAccommodations', 'No accommodations')}
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 flex flex-col gap-3">
          {peers.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={copySourceId}
                onChange={(e) => setCopySourceId(e.target.value)}
                aria-label={t(
                  'studentOverride.copyFromLabel',
                  'Copy overrides from'
                )}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="">
                  {t('studentOverride.copyFromLabel', 'Copy overrides from')}…
                </option>
                {peers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!copySourceId}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Copy className="w-3.5 h-3.5" />
                {t('studentOverride.copy', 'Copy')}
              </button>
            </div>
          )}

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t('studentOverride.timeMultiplier', 'Extended time')}
            </span>
            <div
              role="group"
              aria-label="Extended time"
              className="mt-1 inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden"
            >
              {TIME_MULTIPLIER_OPTIONS.map((opt) => {
                const active = override.timeMultiplier === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => patch({ timeMultiplier: opt.value })}
                    className={
                      'px-3 py-1.5 text-xs font-bold transition ' +
                      (active
                        ? 'bg-brand-blue-primary text-white'
                        : 'text-slate-600 hover:bg-slate-50')
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {quizMode && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {t(
                  'studentOverride.tabWarningThreshold',
                  'Tab-warning threshold'
                )}
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  disabled={override.tabWarningThreshold === 'off'}
                  value={
                    typeof override.tabWarningThreshold === 'number'
                      ? override.tabWarningThreshold
                      : ''
                  }
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    patch({
                      tabWarningThreshold: Number.isFinite(n) ? n : undefined,
                    });
                  }}
                  placeholder={t('studentOverride.default', 'Default')}
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                />
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={override.tabWarningThreshold === 'off'}
                    onChange={(e) =>
                      patch({
                        tabWarningThreshold: e.target.checked
                          ? 'off'
                          : undefined,
                      })
                    }
                  />
                  {t('studentOverride.off', 'Off')}
                </label>
              </div>
            </div>
          )}

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t('studentOverride.windowShift', 'Window shift')}
            </span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-600">
                {t('studentOverride.opensAt', 'Opens')}
                <input
                  type="datetime-local"
                  value={msToLocalInputValue(override.openAt)}
                  onChange={(e) =>
                    patch({ openAt: localInputValueToMs(e.target.value) })
                  }
                  className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                />
              </label>
              <label className="text-xs text-slate-600">
                {t('studentOverride.closesAt', 'Closes')}
                <input
                  type="datetime-local"
                  value={msToLocalInputValue(override.closeAt)}
                  onChange={(e) =>
                    patch({ closeAt: localInputValueToMs(e.target.value) })
                  }
                  className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                />
              </label>
            </div>
          </div>

          {quizMode && questions.length > 0 && (
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {t('studentOverride.questionSubset', 'Question subset')}
              </span>
              <div className="mt-1 flex flex-col gap-1 max-h-40 overflow-y-auto">
                {questions.map((q) => (
                  <label
                    key={q.id}
                    className="flex items-center gap-2 text-xs text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={isQuestionIncluded(q.id)}
                      onChange={() => toggleQuestion(q.id)}
                    />
                    <span className="truncate">{q.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {quizMode && mcQuestions.length > 0 && (
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {t('studentOverride.hideOptions', 'Hide answer options')}
              </span>
              <div className="mt-1 flex flex-col gap-2">
                {mcQuestions.map((q) => (
                  <div key={q.id}>
                    <span className="block text-xs font-semibold text-slate-600 truncate">
                      {q.label}
                    </span>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {(q.options ?? []).map((opt) => {
                        const hidden = (
                          override.hiddenOptionIdsByQuestion?.[q.id] ?? []
                        ).includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={`inline-flex items-center gap-1 text-xs ${
                              opt.isCorrect
                                ? 'text-slate-400'
                                : 'text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={hidden}
                              disabled={opt.isCorrect}
                              onChange={() => toggleHiddenOption(q, opt)}
                            />
                            {opt.text}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {quizMode && writtenQuestions.length > 0 && (
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {t('studentOverride.rubricSwap', 'Rubric swap')}
              </span>
              <div className="mt-1 flex flex-col gap-1.5">
                {writtenQuestions.map((q) => {
                  const overrideValue =
                    override.rubricOverrideByQuestion?.[q.id];
                  const selectValue =
                    overrideValue === 'points'
                      ? 'points'
                      : overrideValue
                        ? overrideValue.id
                        : '';
                  return (
                    <div
                      key={q.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-xs text-slate-700 truncate flex-1">
                        {q.label}
                      </span>
                      <select
                        value={selectValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '') setRubricOverride(q.id, undefined);
                          else if (v === 'points')
                            setRubricOverride(q.id, 'points');
                          else
                            setRubricOverride(
                              q.id,
                              rubrics.find((r) => r.id === v)
                            );
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        <option value="">
                          {t('studentOverride.rubricDefault', 'Default')}
                        </option>
                        <option value="points">
                          {t('studentOverride.rubricPoints', 'Points mode')}
                        </option>
                        {rubrics.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OverrideEditorRow;
