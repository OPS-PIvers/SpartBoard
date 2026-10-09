// Create or edit one group goal from SMART frame pieces; save builds the sentence.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type {
  GradeLevel,
  PlcGoal,
  PlcGoalPractice,
  RoutineGuideRoutine,
} from '@/types';
import { ALL_GRADE_LEVELS, formatGradeRange } from '@/config/widgetGradeLevels';
import { GOAL_SENTENCE_MAX, buildGoalSentence } from './goalSentence';
import { practiceWording, routineFor } from './routineOptions';
import {
  PLC_GOAL_MAX_PRACTICES,
  PLC_GOAL_PROGRESS_KEYS,
  isGoalPercent,
  type PlcGoalDraft,
  type PlcGoalProgress,
} from '@/hooks/usePlcGoals';

const ALL = 'all';

const blankPractice = (): PlcGoalPractice => ({ id: newId(), text: '' });

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30';
const selectClass =
  'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30';
const labelClass =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

interface GoalEditorModalProps {
  goal: PlcGoal | null;
  nextOrder: number;
  routines: readonly RoutineGuideRoutine[];
  /** Grades the routine list starts filtered to; empty shows every routine. */
  gradeLevels?: readonly GradeLevel[];
  onSave: (draft: PlcGoalDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  /** Adds the Now percent (teams redesign). */
  showProgress?: boolean;
}

type ProgressKey = (typeof PLC_GOAL_PROGRESS_KEYS)[number];

export const GoalEditorModal: React.FC<GoalEditorModalProps> = ({
  goal,
  nextOrder,
  routines,
  gradeLevels = [],
  onSave,
  onDelete,
  onClose,
  showProgress = false,
}) => {
  const { t } = useTranslation();
  const [numbers, setNumbers] = useState<Record<ProgressKey, string>>({
    baseline: goal?.baseline?.toString() ?? '',
    current: goal?.current?.toString() ?? '',
    target: goal?.target?.toString() ?? '',
  });
  const progress: PlcGoalProgress = {};
  let progressValid = true;
  for (const key of PLC_GOAL_PROGRESS_KEYS) {
    const raw = numbers[key].trim();
    if (!raw) continue;
    const v = Number(raw);
    if (isGoalPercent(v)) progress[key] = v;
    else progressValid = false;
  }
  const progressLabels: Record<ProgressKey, string> = {
    baseline: t('plcGoals.baselinePct', { defaultValue: 'Baseline (%)' }),
    current: t('plcGoals.currentPct', { defaultValue: 'Now (%)' }),
    target: t('plcGoals.targetPct', { defaultValue: 'Target (%)' }),
  };
  const [dueDate, setDueDate] = useState(goal?.dueDate ?? '');
  const [students, setStudents] = useState(goal?.students ?? '');
  const [outcome, setOutcome] = useState(goal?.outcome ?? '');
  const [measure, setMeasure] = useState(goal?.measure ?? '');
  const [practices, setPractices] = useState<PlcGoalPractice[]>(() =>
    goal?.practices.length ? goal.practices : [blankPractice()]
  );
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);

  const shownGrades: readonly GradeLevel[] =
    grade === ALL ? [] : grade ? [grade as GradeLevel] : gradeLevels;
  const picked = new Set(practices.map((p) => p.routineId).filter(Boolean));
  const routineChoices = routines.filter(
    (r) =>
      !picked.has(r.id) &&
      (shownGrades.length === 0 ||
        r.gradeLevels.length === 0 ||
        r.gradeLevels.some((g) => shownGrades.includes(g)))
  );

  const sentence = buildGoalSentence({
    dueDate,
    students,
    outcome,
    measure,
    ...(progress.baseline !== undefined ? { baseline: progress.baseline } : {}),
    ...(progress.target !== undefined ? { target: progress.target } : {}),
    practices: practices.map((p) => practiceWording(p, routines)),
  });
  // A goal saved before the frame keeps its wording until a piece is filled in.
  const title = sentence ?? goal?.title ?? '';
  const tooLong = title.length > GOAL_SENTENCE_MAX;

  const update = (id: string, text: string) =>
    setPractices((list) => list.map((p) => (p.id === id ? { ...p, text } : p)));

  const addRoutine = (routineId: string) => {
    if (!routineId) return;
    setPractices((list) => [
      ...list.filter((p) => !!p.routineId || p.text.trim().length > 0),
      { id: newId(), routineId, text: '' },
    ]);
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        id: goal?.id,
        title,
        measure,
        dueDate,
        students,
        outcome,
        progress,
        practices,
        order: goal?.order ?? nextOrder,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <div className="flex w-full items-center gap-2">
      {onDelete && (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-brand-red-primary hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('plcGoals.delete', { defaultValue: 'Delete goal' })}
        </button>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
      >
        {t('common.cancel', { defaultValue: 'Cancel' })}
      </button>
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || !title.trim() || tooLong || !progressValid}
        className="rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
      >
        {t('common.save', { defaultValue: 'Save' })}
      </button>
    </div>
  );

  const progressKeys = PLC_GOAL_PROGRESS_KEYS.filter(
    (k) => showProgress || k !== 'current'
  );
  const defaultGradeLabel = gradeLevels.length
    ? t('plcGoals.grades', {
        range: formatGradeRange([...gradeLevels]),
        defaultValue: 'Grades {{range}}',
      })
    : t('plcGoals.allGrades', { defaultValue: 'All grades' });

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        goal
          ? t('plcGoals.editTitle', { defaultValue: 'Edit goal' })
          : t('plcGoals.newTitle', { defaultValue: 'New goal' })
      }
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        <div className="border-b border-slate-200 pb-4">
          <p className={labelClass}>
            {t('plcGoals.goal', { defaultValue: 'Goal' })}
          </p>
          <p
            aria-live="polite"
            className={`text-base leading-relaxed ${title ? 'text-slate-800' : 'text-slate-400'}`}
          >
            {title ||
              t('plcGoals.sentenceFrame', {
                defaultValue: 'By ___, ___% of ___ will ___.',
              })}
          </p>
          {tooLong && (
            <p role="alert" className="mt-1 text-xs text-brand-red-primary">
              {t('plcGoals.tooLong', {
                max: GOAL_SENTENCE_MAX,
                defaultValue:
                  'Shorten the goal to {{max}} characters or fewer.',
              })}
            </p>
          )}
        </div>
        <div className="grid grid-cols-[11rem_1fr] gap-3">
          <div>
            <label htmlFor="goal-due" className={labelClass}>
              {t('plcGoals.by', { defaultValue: 'By' })}
            </label>
            <input
              id="goal-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="goal-students" className={labelClass}>
              {t('plcGoals.students', { defaultValue: 'Students' })}
            </label>
            <input
              id="goal-students"
              value={students}
              maxLength={200}
              placeholder={t('plcGoals.studentsPlaceholder', {
                defaultValue: 'our 7th graders',
              })}
              onChange={(e) => setStudents(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor="goal-outcome" className={labelClass}>
            {t('plcGoals.will', { defaultValue: 'Will' })}
          </label>
          <input
            id="goal-outcome"
            value={outcome}
            maxLength={300}
            placeholder={t('plcGoals.outcomePlaceholder', {
              defaultValue: 'write a claim backed by two pieces of evidence',
            })}
            onChange={(e) => setOutcome(e.target.value)}
            className={inputClass}
          />
        </div>
        <div
          className={`grid gap-3 ${progressKeys.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          {progressKeys.map((key) => (
            <div key={key}>
              <label htmlFor={`goal-${key}`} className={labelClass}>
                {progressLabels[key]}
              </label>
              <input
                id={`goal-${key}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                value={numbers[key]}
                onChange={(e) =>
                  setNumbers((n) => ({ ...n, [key]: e.target.value }))
                }
                className={inputClass}
              />
            </div>
          ))}
        </div>
        <div>
          <label htmlFor="goal-measure" className={labelClass}>
            {t('plcGoals.measuredBy', { defaultValue: 'Measured by' })}
          </label>
          <input
            id="goal-measure"
            value={measure}
            maxLength={200}
            placeholder={t('plcGoals.measurePlaceholder', {
              defaultValue: 'the Unit 3 argument CFA',
            })}
            onChange={(e) => setMeasure(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <p className={labelClass}>
            {t('plcGoals.practicesBy', { defaultValue: 'By these practices' })}
          </p>
          <ul className="flex flex-col gap-2">
            {practices.map((p, i) => {
              const routine = p.routineId
                ? routineFor(routines, p.routineId)
                : null;
              return (
                <li key={p.id} className="flex items-center gap-2">
                  {p.routineId ? (
                    <span className="min-w-0 flex-1 px-3 py-2 text-sm text-slate-800">
                      {routine?.name ?? p.text}
                    </span>
                  ) : (
                    <input
                      aria-label={t('plcGoals.practiceText', {
                        n: i + 1,
                        defaultValue: 'Practice {{n}}',
                      })}
                      value={p.text}
                      maxLength={300}
                      placeholder={
                        i === 0
                          ? t('plcGoals.practicePlaceholder', {
                              defaultValue:
                                'checking work with daily exit tickets',
                            })
                          : undefined
                      }
                      onChange={(e) => update(p.id, e.target.value)}
                      className={inputClass}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setPractices((list) => list.filter((x) => x.id !== p.id))
                    }
                    aria-label={t('plcGoals.removePractice', {
                      defaultValue: 'Remove practice',
                    })}
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          {practices.length < PLC_GOAL_MAX_PRACTICES && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setPractices((list) => [...list, blankPractice()])
                }
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-blue-primary hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('plcGoals.addPractice', { defaultValue: 'Add practice' })}
              </button>
              {routines.length > 0 && (
                <>
                  <span className="flex-1" />
                  <select
                    aria-label={t('plcGoals.addRoutine', {
                      defaultValue: 'Add a routine',
                    })}
                    value=""
                    onChange={(e) => addRoutine(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">
                      {t('plcGoals.addRoutine', {
                        defaultValue: 'Add a routine',
                      })}
                    </option>
                    {routineChoices.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t('plcGoals.routineGrades', {
                      defaultValue: 'Routine grades',
                    })}
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">{defaultGradeLabel}</option>
                    {gradeLevels.length > 0 && (
                      <option value={ALL}>
                        {t('plcGoals.allGrades', {
                          defaultValue: 'All grades',
                        })}
                      </option>
                    )}
                    {ALL_GRADE_LEVELS.map((g) => (
                      <option key={g} value={g}>
                        {t('plcGoals.grades', {
                          range: formatGradeRange([g]),
                          defaultValue: 'Grades {{range}}',
                        })}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
