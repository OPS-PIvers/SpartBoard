import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { RosterGroupSymbol } from '@/types';
import { GroupSymbol } from './GroupSymbol';

interface GroupReminderCardProps {
  symbol?: RosterGroupSymbol;
  time: string;
  /** Group name and/or student names, when the teacher opted in. */
  detail?: string;
  snoozedUntil?: string;
  onSnooze?: () => void;
  onDismiss?: () => void;
}

/** The projected reminder; identical styling whatever the group's symbol. */
export const GroupReminderCard: React.FC<GroupReminderCardProps> = ({
  symbol,
  time,
  detail,
  snoozedUntil,
  onSnooze,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const snoozed = snoozedUntil !== undefined;
  const subtitle = snoozed
    ? t('groupReminders.snoozedUntil', {
        defaultValue: 'Snoozed until {{time}}',
        time: snoozedUntil,
      })
    : (detail ?? t('groupReminders.timeToGo', { defaultValue: 'Time to go' }));
  const dismissLabel = t('groupReminders.dismiss', {
    defaultValue: 'Dismiss',
  });

  return (
    <div
      role={snoozed ? undefined : 'alert'}
      className={`w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 transition-opacity duration-500 ${
        snoozed
          ? 'bg-white/80 backdrop-blur shadow-lg opacity-60'
          : 'bg-white shadow-2xl'
      }`}
    >
      <div className="flex items-center gap-4">
        <GroupSymbol
          symbol={symbol}
          className="w-14 h-14 shrink-0"
          emojiClassName="text-5xl"
        />
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-black text-slate-800 leading-none">
            {time}
          </div>
          <div className="text-sm font-semibold text-slate-500 mt-1 truncate">
            {subtitle}
          </div>
        </div>
        {snoozed && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            title={dismissLabel}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>
      {!snoozed && (onSnooze ?? onDismiss) && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSnooze}
            className="flex-1 px-3 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {t('groupReminders.snooze', { defaultValue: 'Snooze 3 min' })}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 px-3 py-2 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark rounded-lg transition-colors"
          >
            {dismissLabel}
          </button>
        </div>
      )}
    </div>
  );
};
