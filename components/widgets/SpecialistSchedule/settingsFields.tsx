import React, { useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type {
  SpecialistScheduleConfig,
  SpecialistScheduleItem,
  SpecialistScheduleRecurringItem,
  SpecialistScheduleGlobalConfig,
} from '@/types';

const DAYS_OF_WEEK = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const RECURRING_DEFAULTS = [
  { task: '🍴 Lunch', startTime: '11:00', endTime: '11:30' },
  { task: '🛝 Recess', startTime: '11:30', endTime: '12:00' },
  { task: '🚌 Dismissal', startTime: '15:30', endTime: '15:45' },
];

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50';
const smallButtonClass =
  'rounded-lg border border-slate-200 bg-white px-2 py-1 text-xxs font-semibold text-slate-600 hover:border-teal-400 hover:text-teal-700';

const useSpecialistScheduleContext = (ctx: CustomRenderCtx) => {
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(ctx.widget) ?? 'schumann-elementary';
  const globalConfig = featurePermissions.find(
    (permission) => permission.widgetType === 'specialist-schedule'
  )?.config as SpecialistScheduleGlobalConfig | undefined;
  const buildingConfig = globalConfig?.buildingDefaults?.[buildingId];

  return {
    cycleLength: Math.max(1, buildingConfig?.cycleLength ?? 6),
    dayLabel: buildingConfig?.dayLabel ?? 'Day',
    customDayNames: buildingConfig?.customDayNames ?? {},
    specialistOptions: buildingConfig?.specialistOptions ?? [],
  };
};

const SpecialistScheduleItemEditor: React.FC<{
  ctx: CustomRenderCtx;
  draft: SpecialistScheduleItem;
  specialistOptions: string[];
  onChange: (patch: Partial<SpecialistScheduleItem>) => void;
  onCancel: () => void;
  onSave: () => void;
}> = ({ ctx, draft, specialistOptions, onChange, onCancel, onSave }) => {
  const t = (leaf: string) =>
    ctx.t(`widgetSettings.specialist-schedule.${leaf}`);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-800">
          {t('editItem')}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          {t('cancel')}
        </button>
      </div>

      {specialistOptions.length > 0 && (
        <div
          className="flex flex-wrap gap-1"
          role="radiogroup"
          aria-label={t('activity')}
        >
          {specialistOptions.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={draft.task === option}
              onClick={() => onChange({ task: option })}
              className={`rounded-lg border px-2 py-1 text-xxs font-semibold ${
                draft.task === option
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      <div>
        <label
          htmlFor={`${ctx.id}-activity`}
          className="mb-1 block text-xxs font-semibold text-slate-600"
        >
          {t('activity')}
        </label>
        <input
          id={`${ctx.id}-activity`}
          type="text"
          value={draft.task}
          onChange={(event) => onChange({ task: event.target.value })}
          placeholder={t('activityPlaceholder')}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor={`${ctx.id}-start-time`}
            className="mb-1 block text-xxs font-semibold text-slate-600"
          >
            {t('startTime')}
          </label>
          <input
            id={`${ctx.id}-start-time`}
            type="time"
            value={draft.startTime}
            onChange={(event) => onChange({ startTime: event.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor={`${ctx.id}-end-time`}
            className="mb-1 block text-xxs font-semibold text-slate-600"
          >
            {t('endTime')}
          </label>
          <input
            id={`${ctx.id}-end-time`}
            type="time"
            value={draft.endTime ?? ''}
            onChange={(event) => onChange({ endTime: event.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={!draft.task.trim() || !draft.startTime}
        className="w-full rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('saveItem')}
      </button>
    </div>
  );
};

export const SpecialistScheduleCycleDaysField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const config = ctx.config as unknown as SpecialistScheduleConfig;
  const { cycleLength, dayLabel, customDayNames, specialistOptions } =
    useSpecialistScheduleContext(ctx);
  const cycleDays = config.cycleDays ?? [];
  const [selectedCycleDay, setSelectedCycleDay] = useState(1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<SpecialistScheduleItem | null>(null);
  const selectedDay = Math.min(selectedCycleDay, cycleLength);
  const currentDayConfig = cycleDays.find(
    (cycleDay) => cycleDay.dayNumber === selectedDay
  );
  const items = currentDayConfig?.items ?? [];
  const t = (leaf: string) =>
    ctx.t(`widgetSettings.specialist-schedule.${leaf}`);

  const updateCycleDayItems = (nextItems: SpecialistScheduleItem[]) => {
    const nextCycleDays = Array.from({ length: cycleLength }, (_, index) => {
      const dayNumber = index + 1;
      const existing = cycleDays.find((day) => day.dayNumber === dayNumber);
      return dayNumber === selectedDay
        ? { ...(existing ?? { dayNumber, items: [] }), items: nextItems }
        : (existing ?? { dayNumber, items: [] });
    });
    ctx.updateConfig({ cycleDays: nextCycleDays });
  };

  const startAdd = () => {
    setEditingIndex(-1);
    setDraft({
      id: crypto.randomUUID(),
      startTime: '',
      endTime: '',
      task: '',
    });
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setDraft({ ...items[index] });
  };

  const save = () => {
    if (!draft || !draft.task.trim() || !draft.startTime) return;
    const nextItems =
      editingIndex === -1
        ? [...items, { ...draft, task: draft.task.trim() }]
        : items.map((item, index) =>
            index === editingIndex
              ? { ...draft, task: draft.task.trim() }
              : item
          );
    nextItems.sort((left, right) =>
      left.startTime.localeCompare(right.startTime)
    );
    updateCycleDayItems(nextItems);
    setEditingIndex(null);
    setDraft(null);
  };

  const remove = (index: number) => {
    updateCycleDayItems(items.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: cycleLength }, (_, index) => index + 1).map(
          (dayNumber) => {
            const customName = customDayNames[dayNumber];
            const selected = selectedDay === dayNumber;
            return (
              <button
                key={dayNumber}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setSelectedCycleDay(dayNumber);
                  setEditingIndex(null);
                  setDraft(null);
                }}
                className={`min-w-12 rounded-lg border px-2 py-2 text-xxs font-bold ${
                  selected
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                {customName ?? `${dayLabel} ${dayNumber}`}
              </button>
            );
          }
        )}
      </div>

      {editingIndex === null ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700">
              {customDayNames[selectedDay] ?? `${dayLabel} ${selectedDay}`}
            </span>
            <button
              type="button"
              onClick={startAdd}
              className={smallButtonClass}
            >
              {t('addItem')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xxs font-bold tabular-nums text-teal-700">
                    {item.startTime}
                    {item.endTime ? ` - ${item.endTime}` : ''}
                  </div>
                  <div className="truncate text-xs font-semibold text-slate-700">
                    {item.task}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(index)}
                  className={smallButtonClass}
                >
                  {t('editItem')}
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="rounded-lg px-2 py-1 text-xxs font-semibold text-red-600 hover:bg-red-50"
                >
                  {t('deleteItem')}
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs italic text-slate-400">
                {t('noItems')}
              </p>
            )}
          </div>
        </>
      ) : (
        <SpecialistScheduleItemEditor
          ctx={ctx}
          draft={draft ?? { id: '', startTime: '', task: '' }}
          specialistOptions={specialistOptions}
          onChange={(patch) =>
            setDraft((current) =>
              current ? { ...current, ...patch } : current
            )
          }
          onCancel={() => {
            setEditingIndex(null);
            setDraft(null);
          }}
          onSave={save}
        />
      )}
    </div>
  );
};

export const SpecialistScheduleRecurringItemsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const config = ctx.config as unknown as SpecialistScheduleConfig;
  const recurringItems = config.recurringItems ?? [];
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<SpecialistScheduleRecurringItem | null>(
    null
  );
  const t = (leaf: string) =>
    ctx.t(`widgetSettings.specialist-schedule.${leaf}`);

  const startAdd = (type: SpecialistScheduleRecurringItem['type']) => {
    setEditingIndex(-1);
    setDraft({
      id: crypto.randomUUID(),
      startTime: '',
      endTime: '',
      task: '',
      type,
      dayOfWeek: type === 'weekly' ? 5 : undefined,
    });
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setDraft({ ...recurringItems[index] });
  };

  const save = () => {
    if (!draft || !draft.task.trim() || !draft.startTime) return;
    const nextItems =
      editingIndex === -1
        ? [...recurringItems, { ...draft, task: draft.task.trim() }]
        : recurringItems.map((item, index) =>
            index === editingIndex
              ? { ...draft, task: draft.task.trim() }
              : item
          );
    ctx.updateConfig({ recurringItems: nextItems });
    setEditingIndex(null);
    setDraft(null);
  };

  const remove = (index: number) => {
    ctx.updateConfig({
      recurringItems: recurringItems.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    });
  };

  const dayName = (dayOfWeek: number | undefined) =>
    t(DAYS_OF_WEEK[dayOfWeek ?? 0]);

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      {editingIndex === null ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700">
              {t('everyDay')}
            </span>
            <button
              type="button"
              onClick={() => startAdd('daily')}
              className={smallButtonClass}
            >
              {t('addDaily')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {RECURRING_DEFAULTS.map((item) => {
              const exists = recurringItems.some(
                (existing) =>
                  existing.type === 'daily' && existing.task === item.task
              );
              return exists ? null : (
                <button
                  key={item.task}
                  type="button"
                  onClick={() =>
                    ctx.updateConfig({
                      recurringItems: [
                        ...recurringItems,
                        { id: crypto.randomUUID(), ...item, type: 'daily' },
                      ],
                    })
                  }
                  className={smallButtonClass}
                >
                  + {item.task}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            {recurringItems.map((item, index) =>
              item.type === 'daily' ? (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xxs font-bold tabular-nums text-teal-700">
                      {item.startTime}
                      {item.endTime ? ` - ${item.endTime}` : ''}
                    </div>
                    <div className="truncate text-xs font-semibold text-slate-700">
                      {item.task}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(index)}
                    className={smallButtonClass}
                  >
                    {t('editItem')}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="rounded-lg px-2 py-1 text-xxs font-semibold text-red-600 hover:bg-red-50"
                  >
                    {t('deleteItem')}
                  </button>
                </div>
              ) : null
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-bold text-slate-700">
              {t('specificDay')}
            </span>
            <button
              type="button"
              onClick={() => startAdd('weekly')}
              className={smallButtonClass}
            >
              {t('addWeekly')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {recurringItems.map((item, index) =>
              item.type === 'weekly' ? (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xxs font-bold text-teal-700">
                      {t('weeklyOn')} {dayName(item.dayOfWeek)}
                      {' · '}
                      {item.startTime}
                      {item.endTime ? ` - ${item.endTime}` : ''}
                    </div>
                    <div className="truncate text-xs font-semibold text-slate-700">
                      {item.task}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(index)}
                    className={smallButtonClass}
                  >
                    {t('editItem')}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="rounded-lg px-2 py-1 text-xxs font-semibold text-red-600 hover:bg-red-50"
                  >
                    {t('deleteItem')}
                  </button>
                </div>
              ) : null
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              {t('editRecurring')}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingIndex(null);
                setDraft(null);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              {t('cancel')}
            </button>
          </div>
          {draft?.type === 'weekly' && (
            <div>
              <label
                htmlFor={`${ctx.id}-day-of-week`}
                className="mb-1 block text-xxs font-semibold text-slate-600"
              >
                {t('repeatEvery')}
              </label>
              <select
                id={`${ctx.id}-day-of-week`}
                value={draft.dayOfWeek ?? 0}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, dayOfWeek: Number(event.target.value) }
                      : current
                  )
                }
                className={inputClass}
              >
                {DAYS_OF_WEEK.map((day, index) => (
                  <option key={day} value={index}>
                    {t(day)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label
              htmlFor={`${ctx.id}-recurring-activity`}
              className="mb-1 block text-xxs font-semibold text-slate-600"
            >
              {t('activity')}
            </label>
            <input
              id={`${ctx.id}-recurring-activity`}
              type="text"
              value={draft?.task ?? ''}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, task: event.target.value } : current
                )
              }
              placeholder={t('activityPlaceholder')}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor={`${ctx.id}-recurring-start`}
                className="mb-1 block text-xxs font-semibold text-slate-600"
              >
                {t('startTime')}
              </label>
              <input
                id={`${ctx.id}-recurring-start`}
                type="time"
                value={draft?.startTime ?? ''}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, startTime: event.target.value }
                      : current
                  )
                }
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor={`${ctx.id}-recurring-end`}
                className="mb-1 block text-xxs font-semibold text-slate-600"
              >
                {t('endTime')}
              </label>
              <input
                id={`${ctx.id}-recurring-end`}
                type="time"
                value={draft?.endTime ?? ''}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, endTime: event.target.value }
                      : current
                  )
                }
                className={inputClass}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!draft?.task.trim() || !draft.startTime}
            className="w-full rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('saveItem')}
          </button>
        </div>
      )}
    </div>
  );
};
