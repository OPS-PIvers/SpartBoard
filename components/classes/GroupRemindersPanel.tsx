import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Play, Plus, Search, X } from 'lucide-react';
import type {
  RosterGroup,
  RosterGroupAlert,
  RosterGroupReminder,
  RosterGroupSymbol,
  Student,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { GroupSymbol } from '@/components/groupReminders/GroupSymbol';
import { searchGroupIcons } from '@/components/groupReminders/groupIcons';
import { GroupReminderCard } from '@/components/groupReminders/GroupReminderCard';
import {
  GROUP_COLORS,
  EMAIL_MESSAGE_MAX,
  LEAD_OPTIONS,
  MAX_ALERTS,
  REMINDER_SOUNDS,
  SNOOZE_OPTIONS,
  defaultGroupReminder,
  defaultGroupSymbol,
  formatReminderSummary,
  formatReminderTime,
} from '@/utils/groupReminders';
import { playReminderSound } from '@/utils/reminderSounds';
import { SplitClassFooter } from './SplitClassFooter';

interface GroupRemindersPanelProps {
  groups: RosterGroup[];
  students: Student[];
  emailAlertsEnabled?: boolean;
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
  emailAlertsEnabled = false,
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
      reminder: group.reminder ?? defaultGroupReminder(),
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
        emailAlertsEnabled={emailAlertsEnabled}
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
  emailAlertsEnabled: boolean;
  onCancel: () => void;
  onSave: (group: RosterGroup) => void;
}

const GroupWizard: React.FC<GroupWizardProps> = ({
  initial,
  isNew,
  students,
  emailAlertsEnabled,
  onCancel,
  onSave,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [group, setGroup] = useState(initial);
  const symbol = group.symbol ?? defaultGroupSymbol();
  const reminder = group.reminder ?? defaultGroupReminder();
  const setSymbol = (patch: Partial<RosterGroupSymbol>) =>
    setGroup((g) => ({
      ...g,
      symbol: { ...(g.symbol ?? defaultGroupSymbol()), ...patch },
    }));
  const setReminder = (patch: Partial<RosterGroupReminder>) =>
    setGroup((g) => ({
      ...g,
      reminder: { ...(g.reminder ?? defaultGroupReminder()), ...patch },
    }));

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
        message={
          reminder.showMessage
            ? reminder.message.trim() ||
              t('groupReminders.defaultMessage', { defaultValue: 'Time to go' })
            : undefined
        }
        name={
          reminder.showName && group.name.trim() ? group.name.trim() : undefined
        }
        time={
          reminder.showTime
            ? formatReminderTime(reminder.alerts[0]?.time ?? '09:00')
            : undefined
        }
        snoozeMinutes={reminder.snoozeMinutes}
        onSnooze={() => undefined}
        onDismiss={() => undefined}
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
            <SymbolStep
              symbol={symbol}
              name={group.name}
              onSymbol={setSymbol}
              onName={(name) => setGroup((g) => ({ ...g, name }))}
            />
          )}
          {STEPS[step] === 'schedule' && (
            <ScheduleStep reminder={reminder} onChange={setReminder} />
          )}
          {STEPS[step] === 'alerts' && (
            <AlertsStep
              reminder={reminder}
              inGroupMaker={group.inGroupMaker !== false}
              emailAlertsEnabled={emailAlertsEnabled}
              onChange={setReminder}
              onGroupMaker={(inGroupMaker) =>
                setGroup((g) => ({ ...g, inGroupMaker }))
              }
            />
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

const FIELD_LABEL = 'text-xs font-bold text-slate-600';
const SELECT =
  'px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none';

const SymbolStep: React.FC<{
  symbol: RosterGroupSymbol;
  name: string;
  onSymbol: (patch: Partial<RosterGroupSymbol>) => void;
  onName: (name: string) => void;
}> = ({ symbol, name, onSymbol, onName }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const icons = searchGroupIcons(query);
  const searchLabel = t('groupReminders.searchIcons', {
    defaultValue: 'Search icons',
  });

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="relative max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
          />
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 max-h-60 overflow-y-auto custom-scrollbar p-1 -mx-1">
          {icons.map(({ id, Icon }) => {
            const on = symbol.icon === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={id.replace(/-/g, ' ')}
                title={id.replace(/-/g, ' ')}
                aria-pressed={on}
                onClick={() => onSymbol({ icon: id })}
                className={`h-11 rounded-lg flex items-center justify-center transition-colors ${
                  on
                    ? 'ring-2 ring-brand-blue-primary bg-brand-blue-lighter'
                    : 'hover:bg-slate-100'
                }`}
              >
                <Icon
                  size={24}
                  strokeWidth={2.25}
                  style={{ color: on ? symbol.color : '#475569' }}
                />
              </button>
            );
          })}
        </div>
        {icons.length === 0 && (
          <p className="text-sm text-slate-500">
            {t('groupReminders.noIcons', { defaultValue: 'No matching icons' })}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className={FIELD_LABEL}>
          {t('groupReminders.color', { defaultValue: 'Color' })}
        </span>
        <div className="flex flex-wrap gap-2">
          {GROUP_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={symbol.color === color}
              onClick={() => onSymbol({ color })}
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
      <div className="flex flex-col gap-2 max-w-sm">
        <label htmlFor="group-wizard-name" className={FIELD_LABEL}>
          {t('groupReminders.nameOptional', {
            defaultValue: 'Name (optional)',
          })}
        </label>
        <input
          id="group-wizard-name"
          value={name}
          onChange={(e) => onName(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
        />
      </div>
    </div>
  );
};

const SettingRow: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex items-center justify-between gap-4 min-h-9">
    <span className="text-sm font-semibold text-slate-800">{label}</span>
    {children}
  </div>
);

const AlertsStep: React.FC<{
  reminder: RosterGroupReminder;
  inGroupMaker: boolean;
  emailAlertsEnabled: boolean;
  onChange: (patch: Partial<RosterGroupReminder>) => void;
  onGroupMaker: (on: boolean) => void;
}> = ({
  reminder,
  inGroupMaker,
  emailAlertsEnabled,
  onChange,
  onGroupMaker,
}) => {
  const { t } = useTranslation();
  const soundLabels: Record<RosterGroupReminder['sound'], string> = {
    off: t('groupReminders.soundOff', { defaultValue: 'Off' }),
    chime: t('groupReminders.soundChime', { defaultValue: 'Chime' }),
    bell: t('groupReminders.soundBell', { defaultValue: 'Bell' }),
    marimba: t('groupReminders.soundMarimba', { defaultValue: 'Marimba' }),
    harp: t('groupReminders.soundHarp', { defaultValue: 'Harp' }),
  };
  const labels = {
    onBoard: t('groupReminders.reminderOnBoard', {
      defaultValue: 'Reminder on the board',
    }),
    sound: t('groupReminders.sound', { defaultValue: 'Sound' }),
    play: t('groupReminders.playSound', { defaultValue: 'Play sound' }),
    snooze: t('groupReminders.snoozeLength', { defaultValue: 'Snooze' }),
    showName: t('groupReminders.showGroupName', {
      defaultValue: 'Show group name',
    }),
    showTime: t('groupReminders.showTime', { defaultValue: 'Show time' }),
    showMessage: t('groupReminders.showMessage', {
      defaultValue: 'Show a message',
    }),
    message: t('groupReminders.message', { defaultValue: 'Message' }),
    groupMaker: t('groupReminders.inGroupMaker', {
      defaultValue: 'Enable in Group Maker',
    }),
    email: t('groupReminders.emailAlert', { defaultValue: 'Email alert' }),
    emailMessage: t('groupReminders.emailMessage', {
      defaultValue: 'Email message',
    }),
  };

  return (
    <div className="p-6 flex flex-col gap-3 max-w-md">
      <SettingRow label={labels.onBoard}>
        <Toggle
          checked={reminder.enabled}
          onChange={(enabled) => onChange({ enabled })}
          label={labels.onBoard}
        />
      </SettingRow>
      {reminder.enabled && (
        <>
          <SettingRow label={labels.sound}>
            <div className="flex items-center gap-1">
              <select
                aria-label={labels.sound}
                value={reminder.sound}
                onChange={(e) => {
                  const sound =
                    REMINDER_SOUNDS.find((x) => x === e.target.value) ?? 'off';
                  onChange({ sound });
                  playReminderSound(sound);
                }}
                className={`${SELECT} w-36`}
              >
                {REMINDER_SOUNDS.map((sound) => (
                  <option key={sound} value={sound}>
                    {soundLabels[sound]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={reminder.sound === 'off'}
                onClick={() => playReminderSound(reminder.sound)}
                aria-label={labels.play}
                title={labels.play}
                className="p-2 rounded-lg text-slate-500 hover:text-brand-blue-primary hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
              >
                <Play size={16} />
              </button>
            </div>
          </SettingRow>
          <SettingRow label={labels.snooze}>
            <select
              aria-label={labels.snooze}
              value={reminder.snoozeMinutes}
              onChange={(e) =>
                onChange({ snoozeMinutes: Number(e.target.value) })
              }
              className={`${SELECT} w-36 mr-9`}
            >
              {SNOOZE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {t('groupReminders.minutes', {
                    defaultValue: '{{count}} min',
                    count: m,
                  })}
                </option>
              ))}
            </select>
          </SettingRow>
          <div className="border-t border-slate-100 mt-2 pt-3 flex flex-col gap-3">
            <SettingRow label={labels.showName}>
              <Toggle
                checked={reminder.showName}
                onChange={(showName) => onChange({ showName })}
                label={labels.showName}
              />
            </SettingRow>
            <SettingRow label={labels.showTime}>
              <Toggle
                checked={reminder.showTime}
                onChange={(showTime) => onChange({ showTime })}
                label={labels.showTime}
              />
            </SettingRow>
            <SettingRow label={labels.showMessage}>
              <Toggle
                checked={reminder.showMessage}
                onChange={(showMessage) => onChange({ showMessage })}
                label={labels.showMessage}
              />
            </SettingRow>
            {reminder.showMessage && (
              <input
                aria-label={labels.message}
                value={reminder.message}
                maxLength={80}
                onChange={(e) => onChange({ message: e.target.value })}
                placeholder={t('groupReminders.defaultMessage', {
                  defaultValue: 'Time to go',
                })}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
              />
            )}
          </div>
        </>
      )}
      {reminder.enabled && emailAlertsEnabled && (
        <div className="border-t border-slate-100 mt-2 pt-3 flex flex-col gap-3">
          <SettingRow label={labels.email}>
            <Toggle
              checked={reminder.emailAlert}
              onChange={(emailAlert) => onChange({ emailAlert })}
              label={labels.email}
            />
          </SettingRow>
          {reminder.emailAlert && (
            <textarea
              aria-label={labels.emailMessage}
              placeholder={labels.emailMessage}
              value={reminder.emailMessage}
              maxLength={EMAIL_MESSAGE_MAX}
              rows={3}
              onChange={(e) => onChange({ emailMessage: e.target.value })}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 resize-none focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
            />
          )}
        </div>
      )}
      <div className="border-t border-slate-100 mt-2 pt-3">
        <SettingRow label={labels.groupMaker}>
          <Toggle
            checked={inGroupMaker}
            onChange={onGroupMaker}
            label={labels.groupMaker}
          />
        </SettingRow>
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
  const timeLabel = t('groupReminders.time', { defaultValue: 'Time' });
  const leadLabel = t('groupReminders.showReminder', {
    defaultValue: 'Show reminder',
  });
  const removeLabel = t('groupReminders.removeAlert', {
    defaultValue: 'Remove alert',
  });
  const setAlert = (i: number, patch: Partial<RosterGroupAlert>) =>
    onChange({
      alerts: reminder.alerts.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    });
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
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[10rem_11rem_2rem] gap-x-3">
          <span className={FIELD_LABEL}>{timeLabel}</span>
          <span className={FIELD_LABEL}>{leadLabel}</span>
        </div>
        {reminder.alerts.map((alert, i) => (
          <div
            key={i}
            className="grid grid-cols-[10rem_11rem_2rem] gap-x-3 items-center"
          >
            <input
              type="time"
              aria-label={timeLabel}
              value={alert.time}
              onChange={(e) =>
                e.target.value && setAlert(i, { time: e.target.value })
              }
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
            />
            <select
              aria-label={leadLabel}
              value={alert.leadMinutes}
              onChange={(e) =>
                setAlert(i, { leadMinutes: Number(e.target.value) })
              }
              className={SELECT}
            >
              {LEAD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === 0
                    ? t('groupReminders.atTheTime', {
                        defaultValue: 'At the time',
                      })
                    : t('groupReminders.minutesBefore', {
                        defaultValue: '{{count}} min before',
                        count: m,
                      })}
                </option>
              ))}
            </select>
            {reminder.alerts.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    alerts: reminder.alerts.filter((_, j) => j !== i),
                  })
                }
                aria-label={removeLabel}
                title={removeLabel}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        {reminder.alerts.length < MAX_ALERTS && (
          <button
            type="button"
            onClick={() =>
              onChange({
                alerts: [
                  ...reminder.alerts,
                  {
                    time: reminder.alerts[reminder.alerts.length - 1].time,
                    leadMinutes: 0,
                  },
                ],
              })
            }
            className="self-start flex items-center gap-1.5 px-2 py-1 -ml-2 text-sm font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter rounded-md transition-colors"
          >
            <Plus size={16} />
            {t('groupReminders.addAlert', {
              defaultValue: 'Add another alert',
            })}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-6">
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
