import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  GradeLevel,
  RoutineGuideCategory,
  RoutineGuideGlobalConfig,
  RoutineGuideRoutine,
  RoutineGuideStep,
} from '@/types';
import {
  ROUTINE_GUIDE_COLORS,
  ROUTINE_GUIDE_GRADE_LEVELS,
  ROUTINE_GUIDE_INFO_FIELDS,
  getRoutineGuideColor,
  resolveRoutineGuideCategories,
  seedRoutineGuideLibrary,
  sortRoutinesByName,
} from '@/config/routineGuide';
import { useInstructionalRoutines } from '@/hooks/useInstructionalRoutines';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import { IconPicker } from '@/components/widgets/InstructionalRoutines/IconPicker';
import { QUICK_TOOLS } from '@/components/widgets/InstructionalRoutines/constants';
import { RoutineIcon } from '@/components/widgets/RoutineGuide/RoutineIcon';

interface RoutineGuideConfigurationPanelProps {
  config: RoutineGuideGlobalConfig;
  onChange: (newConfig: RoutineGuideGlobalConfig) => void;
}

const GRADE_LABELS: Record<string, string> = {
  'k-2': 'K-2',
  '3-5': '3-5',
  '6-8': '6-8',
  '9-12': '9-12',
};

const newStep = (): RoutineGuideStep => ({
  id: crypto.randomUUID(),
  text: '',
  icon: 'Circle',
  color: 'blue',
});

const inputClass =
  'w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const fieldLabel = 'block text-xs font-bold text-slate-600 mb-1';

const ColorSelect: React.FC<{
  value?: string;
  label: string;
  onChange: (id: string) => void;
}> = ({ value, label, onChange }) => (
  <select
    aria-label={label}
    value={getRoutineGuideColor(value).id}
    onChange={(e) => onChange(e.target.value)}
    className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
  >
    {ROUTINE_GUIDE_COLORS.map((c) => (
      <option key={c.id} value={c.id}>
        {c.label}
      </option>
    ))}
  </select>
);

const StepImage: React.FC<{
  url?: string;
  stepNumber: number;
  onChange: (url: string | undefined) => void;
}> = ({ url, stepNumber, onChange }) => {
  const { user } = useAuth();
  const { uploadDisplayImage } = useStorage();
  const [busy, setBusy] = useState(false);
  if (url) {
    return (
      <span className="relative shrink-0">
        <img
          src={url}
          alt={`Step ${stepNumber} image`}
          className="w-9 h-9 object-cover rounded-lg border border-slate-200"
        />
        <button
          type="button"
          aria-label={`Remove step ${stepNumber} image`}
          onClick={() => onChange(undefined)}
          className="absolute -top-1.5 -right-1.5 bg-white border border-slate-300 rounded-full p-0.5 text-slate-600 hover:text-red-600"
        >
          <X size={10} />
        </button>
      </span>
    );
  }
  return (
    <label
      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-500 hover:text-slate-800 hover:border-slate-500 cursor-pointer"
      title="Add image"
    >
      {busy ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <ImagePlus size={16} />
      )}
      <input
        type="file"
        accept="image/*"
        aria-label={`Step ${stepNumber} image`}
        className="sr-only"
        disabled={busy || !user}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !user) return;
          setBusy(true);
          uploadDisplayImage(user.uid, file)
            .then((u) => onChange(u))
            .catch((err: unknown) =>
              logError('RoutineGuideConfigurationPanel.upload', err)
            )
            .finally(() => setBusy(false));
        }}
      />
    </label>
  );
};

const RoutineEditor: React.FC<{
  routine: RoutineGuideRoutine;
  categories: RoutineGuideCategory[];
  onChange: (r: RoutineGuideRoutine) => void;
  onDone: () => void;
}> = ({ routine, categories, onChange, onDone }) => {
  const set = (patch: Partial<RoutineGuideRoutine>) =>
    onChange({ ...routine, ...patch });
  const setStep = (i: number, patch: Partial<RoutineGuideStep>) =>
    set({
      steps: routine.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    });
  const moveStep = (i: number, dir: -1 | 1) => {
    const steps = [...routine.steps];
    [steps[i], steps[i + dir]] = [steps[i + dir], steps[i]];
    set({ steps });
  };
  const toggleGrade = (g: GradeLevel) =>
    set({
      gradeLevels: routine.gradeLevels.includes(g)
        ? routine.gradeLevels.filter((x) => x !== g)
        : ROUTINE_GUIDE_GRADE_LEVELS.filter(
            (x) => x === g || routine.gradeLevels.includes(x)
          ),
    });

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onDone}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        All routines
      </button>

      <div className="flex items-end gap-3">
        <div>
          <span className={fieldLabel}>Icon</span>
          <IconPicker
            currentIcon={routine.icon}
            color={getRoutineGuideColor(routine.color).id}
            onSelect={(icon) => set({ icon })}
          />
        </div>
        <div>
          <span className={fieldLabel}>Color</span>
          <ColorSelect
            label="Routine color"
            value={routine.color}
            onChange={(color) => set({ color })}
          />
        </div>
        <label className="flex-1">
          <span className={fieldLabel}>Name</span>
          <input
            type="text"
            value={routine.name}
            onChange={(e) => set({ name: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      <fieldset>
        <legend className={fieldLabel}>Grades</legend>
        <div className="flex gap-4">
          {ROUTINE_GUIDE_GRADE_LEVELS.map((g) => (
            <label
              key={g}
              className="inline-flex items-center gap-1.5 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                checked={routine.gradeLevels.includes(g)}
                onChange={() => toggleGrade(g)}
              />
              {GRADE_LABELS[g]}
            </label>
          ))}
        </div>
      </fieldset>

      {categories.length > 0 && (
        <fieldset>
          <legend className={fieldLabel}>Categories</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {categories.map((c) => (
              <label
                key={c.id}
                className="inline-flex items-center gap-1.5 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={routine.categoryIds.includes(c.id)}
                  onChange={() =>
                    set({
                      categoryIds: routine.categoryIds.includes(c.id)
                        ? routine.categoryIds.filter((x) => x !== c.id)
                        : [...routine.categoryIds, c.id],
                    })
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {ROUTINE_GUIDE_INFO_FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className={fieldLabel}>{f.label}</span>
          <textarea
            rows={3}
            value={routine.info?.[f.key] ?? ''}
            onChange={(e) =>
              set({ info: { ...routine.info, [f.key]: e.target.value } })
            }
            className={inputClass}
          />
        </label>
      ))}

      <div>
        <span className={fieldLabel}>Steps</span>
        <ol className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
          {routine.steps.map((step, i) => (
            <li key={step.id} className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-5 text-sm font-black text-slate-400 tabular-nums">
                  {i + 1}
                </span>
                <StepImage
                  url={step.imageUrl}
                  stepNumber={i + 1}
                  onChange={(imageUrl) => setStep(i, { imageUrl })}
                />
                <IconPicker
                  currentIcon={step.icon ?? 'Circle'}
                  color={getRoutineGuideColor(step.color).id}
                  onSelect={(icon) => setStep(i, { icon })}
                />
                <ColorSelect
                  label={`Step ${i + 1} color`}
                  value={step.color}
                  onChange={(color) => setStep(i, { color })}
                />
                <input
                  type="text"
                  aria-label={`Step ${i + 1} label`}
                  placeholder="Label"
                  value={step.label ?? ''}
                  onChange={(e) =>
                    setStep(i, { label: e.target.value || undefined })
                  }
                  className={`${inputClass} max-w-[9rem]`}
                />
                <select
                  aria-label={`Step ${i + 1} tool`}
                  value={step.attachedWidget?.label ?? 'None'}
                  onChange={(e) => {
                    const tool = QUICK_TOOLS.find(
                      (t) => t.label === e.target.value
                    );
                    setStep(i, {
                      attachedWidget:
                        !tool || tool.type === 'none'
                          ? undefined
                          : {
                              type: tool.type,
                              label: tool.label,
                              ...(tool.config
                                ? {
                                    config: Object.fromEntries(
                                      Object.entries(tool.config)
                                    ),
                                  }
                                : {}),
                            },
                    });
                  }}
                  className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {QUICK_TOOLS.map((t) => (
                    <option key={t.label} value={t.label}>
                      {t.type === 'none' ? 'No tool' : t.label}
                    </option>
                  ))}
                </select>
                <div className="ml-auto flex items-center">
                  <button
                    type="button"
                    aria-label={`Move step ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => moveStep(i, -1)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move step ${i + 1} down`}
                    disabled={i === routine.steps.length - 1}
                    onClick={() => moveStep(i, 1)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete step ${i + 1}`}
                    disabled={routine.steps.length === 1}
                    onClick={() =>
                      set({ steps: routine.steps.filter((_, j) => j !== i) })
                    }
                    className="p-1.5 text-slate-500 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <textarea
                aria-label={`Step ${i + 1} text`}
                rows={2}
                value={step.text}
                onChange={(e) => setStep(i, { text: e.target.value })}
                className={inputClass}
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => set({ steps: [...routine.steps, newStep()] })}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-900"
        >
          <Plus size={16} />
          Add step
        </button>
      </div>
    </div>
  );
};

export const RoutineGuideConfigurationPanel: React.FC<
  RoutineGuideConfigurationPanelProps
> = ({ config, onChange }) => {
  const { routines: legacyRoutines } = useInstructionalRoutines();
  const routines = Array.isArray(config.routines)
    ? config.routines.map((r) => ({ ...r, categoryIds: r.categoryIds ?? [] }))
    : seedRoutineGuideLibrary(legacyRoutines);
  const categories = resolveRoutineGuideCategories(config);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const save = (
    next: RoutineGuideRoutine[],
    nextCategories: RoutineGuideCategory[] = categories
  ) => onChange({ ...config, routines: next, categories: nextCategories });
  const saveCategories = (next: RoutineGuideCategory[]) =>
    save(
      routines.map((r) => ({
        ...r,
        categoryIds: r.categoryIds.filter((id) =>
          next.some((c) => c.id === id)
        ),
      })),
      next
    );

  const editing = routines.find((r) => r.id === editingId);
  if (editing) {
    return (
      <RoutineEditor
        routine={editing}
        categories={categories}
        onChange={(r) => save(routines.map((x) => (x.id === r.id ? r : x)))}
        onDone={() => setEditingId(null)}
      />
    );
  }

  const addRoutine = () => {
    const r: RoutineGuideRoutine = {
      id: crypto.randomUUID(),
      name: 'New routine',
      gradeLevels: [...ROUTINE_GUIDE_GRADE_LEVELS],
      categoryIds: [],
      icon: 'ListChecks',
      color: 'blue',
      steps: [newStep()],
    };
    save([...routines, r]);
    setEditingId(r.id);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-black text-slate-700 uppercase tracking-widest">
            Categories
          </h5>
          <button
            type="button"
            onClick={() =>
              saveCategories([
                ...categories,
                { id: crypto.randomUUID(), label: 'New category' },
              ])
            }
            className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-900"
          >
            <Plus size={16} />
            Add category
          </button>
        </div>
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
          {categories.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
              <input
                type="text"
                aria-label={`Category ${i + 1} name`}
                value={c.label}
                onChange={(e) =>
                  saveCategories(
                    categories.map((x) =>
                      x.id === c.id ? { ...x, label: e.target.value } : x
                    )
                  )
                }
                className={inputClass}
              />
              <span className="shrink-0 text-xs text-slate-500 tabular-nums w-20 text-right">
                {routines.filter((r) => r.categoryIds.includes(c.id)).length}{' '}
                routines
              </span>
              <button
                type="button"
                aria-label={`Delete category ${c.label}`}
                onClick={() =>
                  saveCategories(categories.filter((x) => x.id !== c.id))
                }
                className="p-1.5 text-slate-500 hover:text-red-600"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-black text-slate-700 uppercase tracking-widest">
            Routines ({routines.length})
          </h5>
          <button
            type="button"
            onClick={addRoutine}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg"
          >
            <Plus size={16} />
            Add routine
          </button>
        </div>
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
          {sortRoutinesByName(routines).map((r) => {
            const color = getRoutineGuideColor(r.color);
            const grades = r.gradeLevels.map((g) => GRADE_LABELS[g] ?? g);
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <span
                  className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: color.tint, color: color.ink }}
                >
                  <RoutineIcon name={r.icon} size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-slate-800 truncate">
                    {r.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {grades.length ? grades.join(', ') : 'No grades'} ·{' '}
                    {r.steps.length} {r.steps.length === 1 ? 'step' : 'steps'}
                  </span>
                </span>
                {confirmDeleteId === r.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        save(routines.filter((x) => x.id !== r.id));
                        setConfirmDeleteId(null);
                      }}
                      className="px-2.5 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-md"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-md"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center">
                    <button
                      type="button"
                      aria-label={`Edit ${r.name}`}
                      onClick={() => setEditingId(r.id)}
                      className="p-1.5 text-slate-500 hover:text-slate-900"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${r.name}`}
                      onClick={() => setConfirmDeleteId(r.id)}
                      className="p-1.5 text-slate-500 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
