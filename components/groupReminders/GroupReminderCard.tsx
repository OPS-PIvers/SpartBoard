import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlarmClock, X } from 'lucide-react';
import type { RosterGroupSymbol } from '@/types';
import { GroupSymbol } from './GroupSymbol';

interface GroupReminderCardProps {
  symbol?: RosterGroupSymbol;
  /** Each line is opt-in; with none the card is a square holding the icon. */
  message?: string;
  name?: string;
  time?: string;
  snoozeMinutes?: number;
  snoozedUntil?: string;
  onSnooze?: () => void;
  onDismiss?: () => void;
}

/** The projected reminder: the icon first, controls kept small. */
export const GroupReminderCard: React.FC<GroupReminderCardProps> = ({
  symbol,
  message,
  name,
  time,
  snoozeMinutes = 3,
  snoozedUntil,
  onSnooze,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const snoozed = snoozedUntil !== undefined;
  const lines = [message, name, time].filter((l): l is string => !!l);
  const iconOnly = lines.length === 0;
  const snoozeLabel = t('groupReminders.snoozeFor', {
    defaultValue: 'Snooze {{count}} min',
    count: snoozeMinutes,
  });
  const dismissLabel = t('groupReminders.dismiss', {
    defaultValue: 'Dismiss',
  });
  const control =
    'p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors';

  return (
    <div
      role={snoozed ? undefined : 'alert'}
      className={`relative rounded-2xl border border-slate-200 transition-opacity duration-500 ${
        snoozed
          ? 'bg-white/80 backdrop-blur shadow-lg opacity-60'
          : 'bg-white shadow-2xl'
      } ${
        iconOnly
          ? 'w-40 h-40 flex flex-col items-center justify-center'
          : 'w-max min-w-56 max-w-[min(360px,calc(100vw-2rem))] flex items-center gap-4 py-4 pl-4 pr-14'
      }`}
    >
      <GroupSymbol
        symbol={symbol}
        className={iconOnly ? 'w-24 h-24' : 'w-16 h-16'}
      />
      {!iconOnly && (
        <div className="flex-1 min-w-0">
          {lines.map((line, i) => (
            <div
              key={i}
              className={
                i === 0
                  ? 'text-2xl font-black text-slate-800 leading-tight truncate'
                  : 'text-base font-semibold text-slate-500 truncate'
              }
            >
              {line}
            </div>
          ))}
        </div>
      )}
      {snoozed && (
        <div
          className={`flex items-center gap-1 text-xs font-semibold text-slate-500 ${
            iconOnly ? 'absolute bottom-2' : 'absolute bottom-2 right-3'
          }`}
        >
          <AlarmClock size={12} aria-hidden="true" />
          {snoozedUntil}
        </div>
      )}
      <div className="absolute top-2 right-2 flex">
        {!snoozed && onSnooze && (
          <button
            type="button"
            onClick={onSnooze}
            aria-label={snoozeLabel}
            title={snoozeLabel}
            className={control}
          >
            <AlarmClock size={16} />
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            title={dismissLabel}
            className={control}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
