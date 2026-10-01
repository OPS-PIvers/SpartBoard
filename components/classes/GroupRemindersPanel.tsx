import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, X } from 'lucide-react';
import type {
  RosterGroup,
  RosterGroupReminder,
  RosterGroupSymbol,
  Student,
} from '@/types';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Toggle } from '@/components/common/Toggle';
import {
  GroupShape,
  GroupSymbol,
} from '@/components/groupReminders/GroupSymbol';
import { GroupReminderCard } from '@/components/groupReminders/GroupReminderCard';
import {
  GROUP_COLORS,
  GROUP_EMOJIS,
  GROUP_SHAPES,
  defaultGroupReminder,
  defaultGroupSymbol,
  formatReminderSummary,
  formatReminderTime,
} from '@/utils/groupReminders';
import { playTimerAlert, resumeAudio } from '@/utils/timeToolAudio';
import { SplitClassFooter } from './SplitClassFooter';

interface GroupRemindersPanelProps {
  groups: RosterGroup[];
  students: Student[];
  onChange: (groups: RosterGroup[]) => void;
}

const GRID =
  '2.5rem minmax(0,1.2fr) minmax(0,0.6fr) minmax(0,1.6fr) minmax(0,0.8fr) 5rem';
const STEPS = ['students', 'symbol', 'schedule', 'alerts'] as const;
const WEEKDAYS = [1, 2, 3, 4, 5];

const studentName = (s: Student) =>
  `${s.firstName} ${s.lastName}`.trim() || s.id;

/** Groups tab with symbols, weekly reminders and a four-step group wizard. */
export const GroupRemindersPanel: React.FC<GroupRemindersPanelProps> = ({
  groups,
  students,
  onChange,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<RosterGroup | null>(null);
  const [isNew, setIsNew] = useState(false);
  const studentIds = useMemo(
    () => new Set(students.map((s) => s.id)),
    [students]
  );

  const openNew = () => {
    setIsNew(true);
    setDraft({
      id: crypto.randomUUID(),
      name: '',
      studentIds: [],
      inGroupMaker: false,
      symbol: defaultGroupSymbol(),
      reminder: defaultGroupReminder(),
    });
  };

  const openEdit = (group: RosterGroup) => {
    setIsNew(false);
    setDraft({
      ...group,
      symbol: group.symbol ?? defaultGroupSymbol(),
      reminder: group.reminder ?? { ...defaultGroupReminder(), enabled: false },
    });
  };

  const saveDraft = (group: RosterGroup) => {
    onChange(
      isNew
        ? [...groups, group]
        : groups.map((g) => (g.id === group.id ? group : g))
    );
    setDraft(null);
  };

  if (draft) {
    return (
      <GroupWizard
        initial={draft}
        isNew={isNew}
        students={students}
        onCancel={() => setDraft(null)}
        onSave={saveDraft}
      />
    );
  }

  const everyTwoWeeks = t('groupReminders.everyTwoWeeks', {
    defaultValue: 'every 2 weeks',
  });

  return (
    <div className="flex-1 min-h-0 border border-slate-200 rounded-xl bg-white overflow-y-auto custom-scrollbar">
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10 gap-3">
          <p className="font-black uppercase tracking-widest text-slate-500 text-sm">
            {t('sidebar.classes.emptyGroupsTitle', {
              defaultValue: 'No groups yet',
            })}
          </p>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark transition-colors"
          >
            <Plus size={16} />
            {t('groupReminders.newGroup', { defaultValue: 'New group' })}
          </button>
        </div>
      ) : (
        <>
          <div
            className="hidden md:grid items-center gap-4 px-4 py-2 bg-white border-b border-slate-200 text-xxs font-bold text-slate-500 uppercase tracking-widest sticky top-0 z-10"
            style={{ gridTemplateColumns: GRID }}
          >
            <span />
            <span>
              {t('groupReminders.colGroup', { defaultValue: 'Group' })}
            </span>
            <span>
              {t('groupReminders.colStudents', { defaultValue: 'Students' })}
            </span>
            <span>
              {t('groupReminders.colReminder', { defaultValue: 'Reminder' })}
            </span>
            <span>
              {t('groupReminders.colGroupMaker', {
                defaultValue: 'Group Maker',
              })}
            </span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100">
            {groups.map((group) => {
              const count = group.studentIds.filter((id) =>
                studentIds.has(id)
              ).length;
              const r = group.reminder;
              const schedule =
                r && r.days.length > 0
                  ? r.enabled
                    ? formatReminderSummary(r, everyTwoWeeks)
                    : t('groupReminders.reminderOff', { defaultValue: 'Off' })
                  : t('groupReminders.reminderNone', { defaultValue: 'None' });
              const scheduled = !!r?.enabled && r.days.length > 0;
              const inMaker = group.inGroupMaker !== false;
              return (
                <li
                  key={group.id}
                  className="grid items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
                  style={{ gridTemplateColumns: GRID }}
                >
                  <GroupSymbol symbol={group.symbol} />
                  <span
                    className={`text-sm truncate ${group.name.trim() ? 'font-bold text-slate-800' : 'italic text-slate-400'}`}
                  >
                    {group.name.trim() ||
                      t('groupReminders.unnamed', {
                        defaultValue: 'Unnamed',
                      })}
                  </span>
                  <span className="text-sm text-slate-600">{count}</span>
                  <span
                    className={`text-sm truncate ${scheduled ? 'text-slate-700' : 'text-slate-400'}`}
                  >
                    {schedule}
                  </span>
                  <span
                    className={`text-sm ${inMaker ? 'text-slate-700' : 'text-slate-400'}`}
                  >
                    {inMaker
                      ? t('groupReminders.on', { defaultValue: 'On' })
                      : t('groupReminders.off', { defaultValue: 'Off' })}
                  </span>
                  <span className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(group)}
                      className="px-2 py-1 text-sm font-semibold text-slate-500 hover:text-brand-blue-primary rounded-md transition-colors"
                    >
                      {t('common.edit', { defaultValue: 'Edit' })}
                    </button>
                    <button
                      onClick={() =>
                        onChange(groups.filter((g) => g.id !== group.id))
                      }
                      aria-label={t('sidebar.classes.removeGroup', {
                        defaultValue: 'Remove group',
                      })}
                      title={t('sidebar.classes.removeGroup', {
                        defaultValue: 'Remove group',
                      })}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <SplitClassFooter
        students={students}
        onAddGroups={(made) => onChange([...groups, ...made])}
        onNewGroup={groups.length > 0 ? openNew : undefined}
      />
    </div>
  );
};

interface GroupWizardProps {
  initial: RosterGroup;
  isNew: boolean;
  students: Student[];
  onCancel: () => void;
  onSave: (group: RosterGroup) => void;
}

const GroupWizard: React.FC<GroupWizardProps> = ({
  initial,
  isNew,
  students,
  onCancel,
  onSave,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [group, setGroup] = useState(initial);
  const symbol = group.symbol ?? defaultGroupSymbol();
  const reminder = group.reminder ?? defaultGroupReminder();
  const setSymbol = (patch: Partial<RosterGroupSymbol>) =>
    setGroup((g) => ({ ...g, symbol: { ...symbol, ...patch } }));
  const setReminder = (patch: Partial<RosterGroupReminder>) =>
    setGroup((g) => ({ ...g, reminder: { ...reminder, ...patch } }));

  const members = new Set(group.studentIds);
  const memberNames = students
    .filter((s) => members.has(s.id))
    .map((s) => s.firstName.trim())
    .filter(Boolean);
  const detailParts = [
    symbol.showName && group.name.trim() ? group.name.trim() : '',
    reminder.showStudentNames ? memberNames.join(', ') : '',
  ].filter(Boolean);

  const stepLabels = [
    t('groupReminders.stepStudents', { defaultValue: 'Students' }),
    t('groupReminders.stepSymbol', { defaultValue: 'Symbol' }),
    t('groupReminders.stepSchedule', { defaultValue: 'Schedule' }),
    t('groupReminders.stepAlerts', { defaultValue: 'Alerts' }),
  ];
  const last = step === STEPS.length - 1;
  const canSave = group.studentIds.length > 0;

  const preview = (
    <div className="hidden lg:flex w-[360px] shrink-0 border-l border-slate-200 bg-slate-100 rounded-r-xl items-end justify-end p-5">
      <GroupReminderCard
        symbol={symbol}
        time={formatReminderTime(reminder.time)}
        detail={detailParts.length > 0 ? detailParts.join(' · ') : undefined}
      />
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 shrink-0">
        <span className="text-sm font-bold text-slate-800">
          {isNew
            ? t('groupReminders.newGroup', { defaultValue: 'New group' })
            : t('groupReminders.editGroup', { defaultValue: 'Edit group' })}
        </span>
        <ol className="flex flex-wrap items-center gap-5 text-xs font-semibold">
          {stepLabels.map((label, i) => {
            const done = i < step;
            const current = i === step;
            const reachable = !isNew || i <= step;
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => setStep(i)}
                  aria-current={current ? 'step' : undefined}
                  className={`flex items-center gap-1.5 ${current ? 'text-slate-900' : done ? 'text-slate-500' : 'text-slate-400'} disabled:cursor-default`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xxs ${
                      current
                        ? 'bg-brand-blue-primary text-white'
                        : done
                          ? 'bg-slate-200 text-slate-600'
                          : 'border border-slate-300'
                    }`}
                  >
                    {done ? <Check size={12} aria-hidden /> : i + 1}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex-1 min-h-0 border border-slate-200 rounded-xl flex bg-white">
        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar pb-6">
          {STEPS[step] === 'students' && (
            <StudentsStep
              students={students}
              selected={group.studentIds}
              onChange={(studentIds) => setGroup((g) => ({ ...g, studentIds }))}
            />
          )}
          {STEPS[step] === 'symbol' && (
            <div className="p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-600">
                  {t('groupReminders.symbol', { defaultValue: 'Symbol' })}
                </span>
                <div className="self-start">
                  <SegmentedControl
                    role="radiogroup"
                    value={symbol.kind}
                    onChange={(kind) =>
                      setSymbol(
                        kind === 'emoji'
                          ? { kind, emoji: symbol.emoji ?? GROUP_EMOJIS[0] }
                          : { kind, shape: symbol.shape ?? 'star' }
                      )
                    }
                    options={[
                      {
                        value: 'shape',
                        label: t('groupReminders.shape', {
                          defaultValue: 'Shape',
                        }),
                      },
                      {
                        value: 'emoji',
                        label: t('groupReminders.emoji', {
                          defaultValue: 'Emoji',
                        }),
                      },
                    ]}
                  />
                </div>
                {symbol.kind === 'shape' ? (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {GROUP_SHAPES.map((shape) => (
                      <button
                        key={shape}
                        type="button"
                        aria-label={shape}
                        aria-pressed={symbol.shape === shape}
                        onClick={() => setSymbol({ shape })}
                        className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                          symbol.shape === shape
                            ? 'ring-2 ring-brand-blue-primary'
                            : 'border border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <GroupShape shape={shape} color={symbol.color} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-8 gap-2 mt-1 self-start">
                    {GROUP_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        aria-label={emoji}
                        aria-pressed={symbol.emoji === emoji}
                        onClick={() => setSymbol({ emoji })}
                        className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl transition-colors ${
                          symbol.emoji === emoji
                            ? 'ring-2 ring-brand-blue-primary'
                            : 'border border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {symbol.kind === 'shape' && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-600">
                    {t('groupReminders.color', { defaultValue: 'Color' })}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {GROUP_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={color}
                        aria-pressed={symbol.color === color}
                        onClick={() => setSymbol({ color })}
                        className={`w-8 h-8 rounded-full ${
                          symbol.color === color
                            ? 'ring-2 ring-offset-2 ring-brand-blue-primary'
                            : ''
                        }`}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2 max-w-sm">
                <label
                  htmlFor="group-wizard-name"
                  className="text-xs font-bold text-slate-600"
                >
                  {t('groupReminders.nameOptional', {
                    defaultValue: 'Name (optional)',
                  })}
                </label>
                <input
                  id="group-wizard-name"
                  value={group.name}
                  onChange={(e) =>
                    setGroup((g) => ({ ...g, name: e.target.value }))
                  }
                  className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
                />
                <label className="flex items-center gap-2 text-sm text-slate-700 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={symbol.showName}
                    onChange={(e) => setSymbol({ showName: e.target.checked })}
                    className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                  />
                  {t('groupReminders.showName', {
                    defaultValue: 'Show name on the reminder',
                  })}
                </label>
              </div>
            </div>
          )}
          {STEPS[step] === 'schedule' && (
            <ScheduleStep reminder={reminder} onChange={setReminder} />
          )}
          {STEPS[step] === 'alerts' && (
            <div className="p-6 flex flex-col gap-5 max-w-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  {t('groupReminders.reminderOnBoard', {
                    defaultValue: 'Reminder on the board',
                  })}
                </span>
                <Toggle
                  checked={reminder.enabled}
                  onChange={(enabled) => setReminder({ enabled })}
                  label={t('groupReminders.reminderOnBoard', {
                    defaultValue: 'Reminder on the board',
                  })}
                />
              </div>
              {reminder.enabled && (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-600">
                      {t('groupReminders.sound', { defaultValue: 'Sound' })}
                    </span>
                    <div className="self-start">
                      <SegmentedControl
                        role="radiogroup"
                        value={reminder.sound}
                        onChange={(sound) => {
                          setReminder({ sound });
                          if (sound !== 'off')
                            void resumeAudio().then(() =>
                              playTimerAlert(
                                sound === 'alarm' ? 'Alert' : 'Chime'
                              )
                            );
                        }}
                        options={[
                          {
                            value: 'off',
                            label: t('groupReminders.soundOff', {
                              defaultValue: 'Off',
                            }),
                          },
                          {
                            value: 'chime',
                            label: t('groupReminders.soundChime', {
                              defaultValue: 'Chime',
                            }),
                          },
                          {
                            value: 'alarm',
                            label: t('groupReminders.soundAlarm', {
                              defaultValue: 'Alarm',
                            }),
                          },
                        ]}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reminder.showStudentNames}
                      onChange={(e) =>
                        setReminder({ showStudentNames: e.target.checked })
                      }
                      className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                    />
                    {t('groupReminders.showStudentNames', {
                      defaultValue: 'Show student names on the reminder',
                    })}
                  </label>
                </>
              )}
              <div className="border-t border-slate-100 pt-5 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  {t('groupReminders.inGroupMaker', {
                    defaultValue: 'Enable in Group Maker',
                  })}
                </span>
                <Toggle
                  checked={group.inGroupMaker !== false}
                  onChange={(inGroupMaker) =>
                    setGroup((g) => ({ ...g, inGroupMaker }))
                  }
                  label={t('groupReminders.inGroupMaker', {
                    defaultValue: 'Enable in Group Maker',
                  })}
                />
              </div>
            </div>
          )}
        </div>
        {(STEPS[step] === 'symbol' || STEPS[step] === 'alerts') && preview}
      </div>

      <div className="flex justify-between shrink-0">
        <button
          type="button"
          onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
          className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          {step === 0
            ? t('common.cancel', { defaultValue: 'Cancel' })
            : t('common.back', { defaultValue: 'Back' })}
        </button>
        <div className="flex gap-2">
          {!isNew && !last && (
            <button
              type="button"
              disabled={!canSave}
              onClick={() => onSave(group)}
              className="px-4 py-2 text-sm font-bold text-brand-blue-primary bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {t('groupReminders.saveGroup', { defaultValue: 'Save group' })}
            </button>
          )}
          <button
            type="button"
            disabled={(step === 0 || last) && !canSave}
            onClick={() => (last ? onSave(group) : setStep(step + 1))}
            className="px-5 py-2 text-sm font-bold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
          >
            {last
              ? t('groupReminders.saveGroup', { defaultValue: 'Save group' })
              : t('common.next', { defaultValue: 'Next' })}
          </button>
        </div>
      </div>
    </div>
  );
};

const StudentsStep: React.FC<{
  students: Student[];
  selected: string[];
  onChange: (ids: string[]) => void;
}> = ({ students, selected, onChange }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const picked = new Set(selected);
  const q = search.trim().toLowerCase();
  const shown = q
    ? students.filter((s) => studentName(s).toLowerCase().includes(q))
    : students;
  const toggle = (id: string) =>
    onChange(
      picked.has(id) ? selected.filter((s) => s !== id) : [...selected, id]
    );

  if (students.length === 0) {
    return (
      <p className="p-6 text-sm text-slate-500">
        {t('sidebar.classes.noStudentsToGroup', {
          defaultValue: 'Add students first.',
        })}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 sticky top-0 bg-white">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('groupReminders.searchStudents', {
            defaultValue: 'Search students',
          })}
          aria-label={t('groupReminders.searchStudents', {
            defaultValue: 'Search students',
          })}
          className="flex-1 px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
        />
        <span className="text-xs font-semibold text-slate-600 shrink-0">
          {t('groupReminders.selectedCount', {
            defaultValue: '{{count}} selected',
            count: selected.length,
          })}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 p-4">
        {shown.map((s) => (
          <label
            key={s.id}
            className="flex items-center gap-2 py-1 text-sm text-slate-700 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={picked.has(s.id)}
              onChange={() => toggle(s.id)}
              className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
            />
            <span className="truncate">{studentName(s)}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

const ScheduleStep: React.FC<{
  reminder: RosterGroupReminder;
  onChange: (patch: Partial<RosterGroupReminder>) => void;
}> = ({ reminder, onChange }) => {
  const { t } = useTranslation();
  const toggleDay = (d: number) =>
    onChange({
      days: reminder.days.includes(d)
        ? reminder.days.filter((x) => x !== d)
        : [...reminder.days, d].sort((a, b) => a - b),
    });

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-slate-600">
          {t('groupReminders.days', { defaultValue: 'Days' })}
        </span>
        <div className="flex gap-2">
          {WEEKDAYS.map((d) => {
            const on = reminder.days.includes(d);
            const date = new Date(2000, 0, 2 + d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={date.toLocaleDateString(undefined, {
                  weekday: 'long',
                })}
                onClick={() => toggleDay(d)}
                className={`w-10 h-10 rounded-full text-sm font-bold transition-colors ${
                  on
                    ? 'bg-brand-blue-primary text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {date.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="group-wizard-time"
            className="text-xs font-bold text-slate-600"
          >
            {t('groupReminders.time', { defaultValue: 'Time' })}
          </label>
          <input
            id="group-wizard-time"
            type="time"
            value={reminder.time}
            onChange={(e) =>
              e.target.value && onChange({ time: e.target.value })
            }
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 w-40 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="group-wizard-repeat"
            className="text-xs font-bold text-slate-600"
          >
            {t('groupReminders.repeats', { defaultValue: 'Repeats' })}
          </label>
          <select
            id="group-wizard-repeat"
            value={reminder.repeat}
            onChange={(e) =>
              onChange({
                repeat: e.target.value === 'biweekly' ? 'biweekly' : 'weekly',
              })
            }
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white w-48 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
          >
            <option value="weekly">
              {t('groupReminders.everyWeek', { defaultValue: 'Every week' })}
            </option>
            <option value="biweekly">
              {t('groupReminders.everyTwoWeeksOption', {
                defaultValue: 'Every 2 weeks',
              })}
            </option>
          </select>
        </div>
        {reminder.repeat === 'biweekly' && (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="group-wizard-start"
              className="text-xs font-bold text-slate-600"
            >
              {t('groupReminders.starting', { defaultValue: 'Starting' })}
            </label>
            <input
              id="group-wizard-start"
              type="date"
              value={reminder.startDate}
              onChange={(e) =>
                e.target.value && onChange({ startDate: e.target.value })
              }
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
            />
          </div>
        )}
      </div>
      {reminder.days.length > 0 && (
        <p className="text-sm text-slate-600">
          {formatReminderSummary(
            reminder,
            t('groupReminders.everyTwoWeeks', {
              defaultValue: 'every 2 weeks',
            })
          )}
        </p>
      )}
    </div>
  );
};
