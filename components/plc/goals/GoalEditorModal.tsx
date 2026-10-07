// Create or edit one group goal: title, measure and its practices.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { PlcGoal, PlcGoalPractice, RoutineGuideRoutine } from '@/types';
import {
  PLC_GOAL_MAX_PRACTICES,
  PLC_GOAL_PROGRESS_KEYS,
  isGoalPercent,
  type PlcGoalDraft,
  type PlcGoalProgress,
} from '@/hooks/usePlcGoals';

const OTHER = '__other__';

type DraftPractice = PlcGoalPractice & { custom?: boolean };

const blankPractice = (): DraftPractice => ({ id: newId(), text: '' });

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30';
const labelClass =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

interface GoalEditorModalProps {
  goal: PlcGoal | null;
  nextOrder: number;
  routines: readonly RoutineGuideRoutine[];
  onSave: (draft: PlcGoalDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  /** Shows the baseline, now and goal percents (teams redesign). */
  showProgress?: boolean;
}

type ProgressKey = (typeof PLC_GOAL_PROGRESS_KEYS)[number];

export const GoalEditorModal: React.FC<GoalEditorModalProps> = ({
  goal,
  nextOrder,
  routines,
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
    target: t('plcGoals.targetPct', { defaultValue: 'Goal (%)' }),
  };
  const [title, setTitle] = useState(goal?.title ?? '');
  const [measure, setMeasure] = useState(goal?.measure ?? '');
  const [practices, setPractices] = useState<DraftPractice[]>(() =>
    goal?.practices.length
      ? goal.practices.map((p) => ({ ...p, custom: !p.routineId }))
      : [blankPractice()]
  );
  const [busy, setBusy] = useState(false);

  const update = (id: string, patch: Partial<DraftPractice>) =>
    setPractices((list) =>
      list.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );

  const pickRoutine = (id: string, value: string) =>
    setPractices((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        if (value === OTHER) return { id: p.id, text: p.text, custom: true };
        if (!value) return { id: p.id, text: '' };
        return { id: p.id, routineId: value, text: '' };
      })
    );

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        id: goal?.id,
        title,
        measure,
        ...(showProgress ? { progress } : {}),
        practices: practices.map(({ custom: _custom, ...p }) => p),
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
        disabled={busy || !title.trim() || (showProgress && !progressValid)}
        className="rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
      >
        {t('common.save', { defaultValue: 'Save' })}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-xl"
      title={
        goal
          ? t('plcGoals.editTitle', { defaultValue: 'Edit goal' })
          : t('plcGoals.newTitle', { defaultValue: 'New goal' })
      }
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="goal-title" className={labelClass}>
            {t('plcGoals.goal', { defaultValue: 'Goal' })}
          </label>
          <input
            id="goal-title"
            value={title}
            maxLength={300}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="goal-measure" className={labelClass}>
            {t('plcGoals.measure', { defaultValue: 'Measure' })}
          </label>
          <input
            id="goal-measure"
            value={measure}
            onChange={(e) => setMeasure(e.target.value)}
            className={inputClass}
          />
        </div>
        {showProgress && (
          <div className="grid grid-cols-3 gap-3">
            {PLC_GOAL_PROGRESS_KEYS.map((key) => (
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
        )}
        <div>
          <p className={labelClass}>
            {t('plcGoals.practices', { defaultValue: 'Practices' })}
          </p>
          <ul className="flex flex-col gap-2">
            {practices.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2">
                <select
                  aria-label={t('plcGoals.practiceRoutine', {
                    n: i + 1,
                    defaultValue: 'Practice {{n}} routine',
                  })}
                  value={p.routineId ?? (p.custom ? OTHER : '')}
                  onChange={(e) => pickRoutine(p.id, e.target.value)}
                  className={`${inputClass} ${p.custom ? 'max-w-[11rem]' : ''}`}
                >
                  <option value="">
                    {t('plcGoals.chooseRoutine', {
                      defaultValue: 'Choose a routine',
                    })}
                  </option>
                  {routines.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  <option value={OTHER}>
                    {t('plcGoals.otherPractice', {
                      defaultValue: 'Other practice',
                    })}
                  </option>
                </select>
                {p.custom && (
                  <input
                    aria-label={t('plcGoals.practiceText', {
                      n: i + 1,
                      defaultValue: 'Practice {{n}}',
                    })}
                    value={p.text}
                    onChange={(e) => update(p.id, { text: e.target.value })}
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
            ))}
          </ul>
          {practices.length < PLC_GOAL_MAX_PRACTICES && (
            <button
              type="button"
              onClick={() => setPractices((list) => [...list, blankPractice()])}
              className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-blue-primary hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('plcGoals.addPractice', { defaultValue: 'Add practice' })}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
