// Symbol and Schedule sections of a class group page (Group reminders flag).
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Plus, Search, X } from 'lucide-react';
import type {
  RosterGroup,
  RosterGroupAlert,
  RosterGroupReminder,
  RosterGroupSymbol,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
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

const WEEKDAYS = [1, 2, 3, 4, 5];

/** The reminder card as students see it, for the group being edited. */
const ReminderPreview: React.FC<{ group: RosterGroup }> = ({ group }) => {
  const { t } = useTranslation();
  const reminder = group.reminder ?? defaultGroupReminder();
  return (
    <div
      className="hidden md:block shrink-0"
      {...tourAttr('group-wizard.preview')}
    >
      <GroupReminderCard
        symbol={group.symbol ?? defaultGroupSymbol()}
        message={
          reminder.showMessage
            ? reminder.message.trim() ||
              t('groupReminders.defaultMessage', {
                defaultValue: 'Time to go',
              })
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
};

/** Icon and color for the group; the reminder preview sits here only when there is no Schedule section. */
export const GroupSymbolSection: React.FC<{
  group: RosterGroup;
  withPreview: boolean;
  onPatch: (change: Partial<RosterGroup>) => void;
}> = ({ group, withPreview, onPatch }) => (
  <SymbolStep
    symbol={group.symbol ?? defaultGroupSymbol()}
    onSymbol={(patch) =>
      onPatch({
        symbol: { ...(group.symbol ?? defaultGroupSymbol()), ...patch },
      })
    }
    preview={withPreview ? <ReminderPreview group={group} /> : undefined}
  />
);

/** Weekly reminder on the board for the group. */
export const GroupReminderSection: React.FC<{
  group: RosterGroup;
  emailAlertsEnabled: boolean;
  onPatch: (change: Partial<RosterGroup>) => void;
}> = ({ group, emailAlertsEnabled, onPatch }) => (
  <ScheduleStep
    reminder={group.reminder ?? defaultGroupReminder()}
    emailAlertsEnabled={emailAlertsEnabled}
    onChange={(patch) =>
      onPatch({
        reminder: { ...(group.reminder ?? defaultGroupReminder()), ...patch },
        // The board card draws a missing symbol as a blank tile, so store the star the preview shows.
        ...(group.symbol ? {} : { symbol: defaultGroupSymbol() }),
      })
    }
    preview={<ReminderPreview group={group} />}
  />
);

const FIELD_LABEL = 'text-xs font-bold text-slate-600';
const SELECT =
  'px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden';

const SymbolStep: React.FC<{
  symbol: RosterGroupSymbol;
  onSymbol: (patch: Partial<RosterGroupSymbol>) => void;
  preview?: React.ReactNode;
}> = ({ symbol, onSymbol, preview }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const icons = searchGroupIcons(query);
  const searchLabel = t('groupReminders.searchIcons', {
    defaultValue: 'Search icons',
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-10">
        <div className="flex-1 min-w-0 max-w-sm flex flex-col gap-4">
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
              {...tourAttr('group-wizard.icon-search')}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden"
            />
          </div>
        </div>
        {preview}
      </div>
      <div className="flex flex-col gap-2">
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
                {...tourFieldAttr('group-wizard.icon', 'group-wizard', id)}
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
              {...tourFieldAttr('group-wizard.color', 'group-wizard', color)}
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

const ReminderCardSettings: React.FC<{
  reminder: RosterGroupReminder;
  emailAlertsEnabled: boolean;
  onChange: (patch: Partial<RosterGroupReminder>) => void;
}> = ({ reminder, emailAlertsEnabled, onChange }) => {
  const { t } = useTranslation();
  const soundLabels: Record<RosterGroupReminder['sound'], string> = {
    off: t('groupReminders.soundOff', { defaultValue: 'Off' }),
    chime: t('groupReminders.soundChime', { defaultValue: 'Chime' }),
    bell: t('groupReminders.soundBell', { defaultValue: 'Bell' }),
    marimba: t('groupReminders.soundMarimba', { defaultValue: 'Marimba' }),
    harp: t('groupReminders.soundHarp', { defaultValue: 'Harp' }),
  };
  const labels = {
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
    email: t('groupReminders.emailAlert', { defaultValue: 'Email alert' }),
    emailMessage: t('groupReminders.emailMessage', {
      defaultValue: 'Email message',
    }),
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3 max-w-md">
      <SettingRow label={labels.sound}>
        <div className="flex items-center gap-1">
          <select
            aria-label={labels.sound}
            {...tourAttr('group-wizard.sound')}
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
            {...tourAttr('group-wizard.play-sound')}
            className="p-2 rounded-lg text-slate-500 hover:text-brand-blue-primary hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
          >
            <Play size={16} />
          </button>
        </div>
      </SettingRow>
      <SettingRow label={labels.snooze}>
        <select
          aria-label={labels.snooze}
          {...tourAttr('group-wizard.snooze')}
          value={reminder.snoozeMinutes}
          onChange={(e) => onChange({ snoozeMinutes: Number(e.target.value) })}
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
      <SettingRow label={labels.showName}>
        <Toggle
          checked={reminder.showName}
          onChange={(showName) => onChange({ showName })}
          label={labels.showName}
          anchor={tourAttr('group-wizard.show-name')}
        />
      </SettingRow>
      <SettingRow label={labels.showTime}>
        <Toggle
          checked={reminder.showTime}
          onChange={(showTime) => onChange({ showTime })}
          label={labels.showTime}
          anchor={tourAttr('group-wizard.show-time')}
        />
      </SettingRow>
      <SettingRow label={labels.showMessage}>
        <Toggle
          checked={reminder.showMessage}
          onChange={(showMessage) => onChange({ showMessage })}
          label={labels.showMessage}
          anchor={tourAttr('group-wizard.show-message')}
        />
      </SettingRow>
      {reminder.showMessage && (
        <input
          aria-label={labels.message}
          {...tourAttr('group-wizard.message')}
          value={reminder.message}
          maxLength={80}
          onChange={(e) => onChange({ message: e.target.value })}
          placeholder={t('groupReminders.defaultMessage', {
            defaultValue: 'Time to go',
          })}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden"
        />
      )}
      {emailAlertsEnabled && (
        <>
          <SettingRow label={labels.email}>
            <Toggle
              checked={reminder.emailAlert}
              onChange={(emailAlert) => onChange({ emailAlert })}
              label={labels.email}
              anchor={tourAttr('group-wizard.email-alert')}
            />
          </SettingRow>
          {reminder.emailAlert && (
            <textarea
              aria-label={labels.emailMessage}
              {...tourAttr('group-wizard.email-message')}
              placeholder={labels.emailMessage}
              value={reminder.emailMessage}
              maxLength={EMAIL_MESSAGE_MAX}
              rows={3}
              onChange={(e) => onChange({ emailMessage: e.target.value })}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 resize-none focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden"
            />
          )}
        </>
      )}
    </div>
  );
};

const ScheduleStep: React.FC<{
  reminder: RosterGroupReminder;
  emailAlertsEnabled: boolean;
  onChange: (patch: Partial<RosterGroupReminder>) => void;
  preview?: React.ReactNode;
}> = ({ reminder, emailAlertsEnabled, onChange, preview }) => {
  const { t } = useTranslation();
  const onBoardLabel = t('groupReminders.reminderOnBoard', {
    defaultValue: 'Reminder on the board',
  });
  const timeLabel = t('groupReminders.time', { defaultValue: 'Time' });
  const leadLabel = t('groupReminders.popsUp', {
    defaultValue: 'Pops up',
  });
  const removeLabel = t('groupReminders.removeTime', {
    defaultValue: 'Remove time',
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

  const toggle = (
    <div className="max-w-md">
      <SettingRow label={onBoardLabel}>
        <Toggle
          checked={reminder.enabled}
          onChange={(enabled) => onChange({ enabled })}
          label={onBoardLabel}
          anchor={tourAttr('group-wizard.on-board')}
        />
      </SettingRow>
    </div>
  );
  if (!reminder.enabled) return toggle;

  return (
    <div className="flex flex-col gap-5">
      {toggle}
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
                {...tourFieldAttr(
                  'group-wizard.day',
                  'group-wizard',
                  `day-${d}`
                )}
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
        <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,11rem)_auto] gap-x-3">
          <span className={FIELD_LABEL}>{timeLabel}</span>
          <span className={FIELD_LABEL}>{leadLabel}</span>
        </div>
        {reminder.alerts.map((alert, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,10rem)_minmax(0,11rem)_auto] gap-x-3 items-center"
          >
            <input
              type="time"
              aria-label={timeLabel}
              {...tourFieldAttr(
                'group-wizard.alert-time',
                'group-wizard',
                `alert-${i + 1}`
              )}
              value={alert.time}
              onChange={(e) =>
                e.target.value && setAlert(i, { time: e.target.value })
              }
              className="w-full min-w-0 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden"
            />
            <select
              aria-label={leadLabel}
              {...tourFieldAttr(
                'group-wizard.alert-lead',
                'group-wizard',
                `alert-${i + 1}`
              )}
              value={alert.leadMinutes}
              onChange={(e) =>
                setAlert(i, { leadMinutes: Number(e.target.value) })
              }
              className={`${SELECT} w-full min-w-0`}
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
                {...tourFieldAttr(
                  'group-wizard.alert-remove',
                  'group-wizard',
                  `alert-${i + 1}`
                )}
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
            {...tourAttr('group-wizard.add-alert')}
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
            {t('groupReminders.addTime', {
              defaultValue: 'Add another time',
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
            {...tourAttr('group-wizard.repeat')}
            value={reminder.repeat}
            onChange={(e) =>
              onChange({
                repeat: e.target.value === 'biweekly' ? 'biweekly' : 'weekly',
              })
            }
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white w-48 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden"
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
              {...tourAttr('group-wizard.start-date')}
              type="date"
              value={reminder.startDate}
              onChange={(e) =>
                e.target.value && onChange({ startDate: e.target.value })
              }
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden"
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
      <div className="border-t border-slate-100 pt-4 flex items-start gap-10">
        <ReminderCardSettings
          reminder={reminder}
          emailAlertsEnabled={emailAlertsEnabled}
          onChange={onChange}
        />
        {preview}
      </div>
    </div>
  );
};
