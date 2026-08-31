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

import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Copy } from 'lucide-react';
import type { Rubric, StudentOverride } from '@/types';
import { summarizeOverride } from '@/utils/studentOverrideSummary';
import { SegmentedControl } from '@/components/common/SegmentedControl';

export interface OverrideEditorQuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

/**
 * A question the override editor can target. `options` present ⇒ MC (hider
 * applies). `isWritten` true ⇒ short/essay (rubric swap applies). A question
 * with neither (FIB/Matching/Ordering) is only selectable in the bare
 * question-subset picker — no per-question hider or rubric swap (F2 fix).
 */
export interface OverrideEditorQuestion {
  id: string;
  label: string;
  options?: OverrideEditorQuestionOption[];
  isWritten?: boolean;
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

/** `labelKey`/`labelDefault` are absent for the bare multiplier units (1.5x, 2x), which read the same in every locale. */
const TIME_MULTIPLIER_OPTIONS: Array<{
  id: string;
  labelKey?: string;
  labelDefault?: string;
  value: StudentOverride['timeMultiplier'];
}> = [
  {
    id: 'none',
    labelKey: 'studentOverride.timeMultiplierNone',
    labelDefault: 'None',
    value: undefined,
  },
  { id: '1.5x', value: 1.5 },
  { id: '2x', value: 2 },
  {
    id: 'unlimited',
    labelKey: 'studentOverride.timeMultiplierUnlimited',
    labelDefault: 'Unlimited',
    value: 'unlimited',
  },
];

const timeMultiplierOptionById = (id: string) =>
  TIME_MULTIPLIER_OPTIONS.find((opt) => opt.id === id);
const timeMultiplierIdForValue = (
  value: StudentOverride['timeMultiplier']
): string =>
  TIME_MULTIPLIER_OPTIONS.find((opt) => opt.value === value)?.id ?? 'none';

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
  const tabWarningInputId = useId();
  // Per-question ids, so each rubric select is named by its own question.
  const rubricSelectIdBase = useId();

  const totalQuestions = quizMode ? questions.length : undefined;
  const chips = summarizeOverride(override, t, { totalQuestions });

  const patch = (next: Partial<StudentOverride>) =>
    onChange({ ...override, ...next });

  const handleCopy = () => {
    const source = peers.find((p) => p.id === copySourceId);
    if (!source) return;
    // Deep clone so the two rows never share nested references.
    onChange(structuredClone(source.override));
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
    else if (value === 'points') current[questionId] = 'points';
    // Deep clone: the stored value is a RubricSnapshot, so it must not alias
    // the live library rubric and drift when that rubric is later edited.
    else current[questionId] = structuredClone(value);
    patch({
      rubricOverrideByQuestion:
        Object.keys(current).length > 0 ? current : undefined,
    });
  };

  const writtenQuestions = questions.filter((q) => q.isWritten);
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
            <div className="mt-1">
              <SegmentedControl
                ariaLabel={t('studentOverride.timeMultiplier', 'Extended time')}
                value={timeMultiplierIdForValue(override.timeMultiplier)}
                onChange={(id) =>
                  patch({ timeMultiplier: timeMultiplierOptionById(id)?.value })
                }
                options={TIME_MULTIPLIER_OPTIONS.map((opt) => ({
                  value: opt.id,
                  label: opt.labelKey
                    ? t(opt.labelKey, opt.labelDefault ?? opt.id)
                    : opt.id,
                }))}
              />
            </div>
          </div>

          {quizMode && (
            <div>
              <label
                htmlFor={tabWarningInputId}
                className="text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                {t(
                  'studentOverride.tabWarningThreshold',
                  'Tab-warning threshold'
                )}
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id={tabWarningInputId}
                  type="number"
                  min={1}
                  disabled={override.tabWarningThreshold === 'off'}
                  value={
                    typeof override.tabWarningThreshold === 'number'
                      ? override.tabWarningThreshold
                      : ''
                  }
                  onChange={(e) => {
                    // `min` only gates form validation, so clamp here: a 0 or
                    // negative threshold would reach the live quiz session.
                    const n = Number.parseInt(e.target.value, 10);
                    patch({
                      tabWarningThreshold: Number.isFinite(n)
                        ? Math.max(1, n)
                        : undefined,
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
                  // A stored snapshot whose source rubric is gone from the
                  // library (edited away, deleted, or copied from a peer) still
                  // needs an option, or the select would silently read
                  // "Default" while the override says otherwise.
                  const storedSnapshot =
                    overrideValue && overrideValue !== 'points'
                      ? overrideValue
                      : null;
                  const selectable =
                    storedSnapshot &&
                    !rubrics.some((r) => r.id === storedSnapshot.id)
                      ? [...rubrics, storedSnapshot]
                      : rubrics;
                  return (
                    <div
                      key={q.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <label
                        htmlFor={`${rubricSelectIdBase}-${q.id}`}
                        className="text-xs text-slate-700 truncate flex-1"
                      >
                        {q.label}
                      </label>
                      <select
                        id={`${rubricSelectIdBase}-${q.id}`}
                        value={selectValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '') setRubricOverride(q.id, undefined);
                          else if (v === 'points')
                            setRubricOverride(q.id, 'points');
                          else
                            setRubricOverride(
                              q.id,
                              selectable.find((r) => r.id === v)
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
                        {selectable.map((r) => (
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
