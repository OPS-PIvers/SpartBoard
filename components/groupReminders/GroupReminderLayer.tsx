import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ClassRoster } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import {
  DueReminder,
  dueReminders,
  formatReminderTime,
  toLocalDateKey,
} from '@/utils/groupReminders';
import { playReminderSound } from '@/utils/reminderSounds';
import { GroupReminderCard } from './GroupReminderCard';

const TICK_MS = 10_000;
const LEAVE_MS = 500;
const DISMISSED_KEY = 'spart.groupReminders.dismissed';

interface ShownReminder extends DueReminder {
  snoozedUntil?: number;
  leaving?: boolean;
}

function readDismissed(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** Remembers a dismissal for the rest of the day so a reload does not re-fire it. */
function rememberDismissed(key: string) {
  try {
    const today = toLocalDateKey(new Date());
    const kept = Object.fromEntries(
      Object.entries(readDismissed()).filter(([, day]) => day === today)
    );
    kept[key] = today;
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(kept));
  } catch {
    // Storage blocked: the dismissal still holds for this tab.
  }
}

const playFor = (r: DueReminder) =>
  playReminderSound(r.group.reminder?.sound ?? 'off');

const snoozeDeadline = (minutes: number) => Date.now() + minutes * 60_000;

/**
 * Bottom-right stack of pull-out reminders for the teacher's class groups.
 * Fires only while a board is open; sits above maximized widgets and dialogs.
 */
export const GroupReminderLayer: React.FC<{ rosters: ClassRoster[] }> = ({
  rosters,
}) => {
  const { t } = useTranslation();
  const defaultMessage = t('groupReminders.defaultMessage', {
    defaultValue: 'Time to go',
  });
  const [shown, setShown] = useState<ShownReminder[]>([]);
  const handledRef = useRef(new Set<string>());

  const tick = useEffectEvent(() => {
    const now = Date.now();
    const dismissed = readDismissed();
    const fresh = dueReminders(rosters, now).filter(
      (r) => !dismissed[r.key] && !handledRef.current.has(r.key)
    );
    fresh.forEach((r) => {
      handledRef.current.add(r.key);
      playFor(r);
    });
    const expired = shown.filter(
      (r) => r.snoozedUntil !== undefined && r.snoozedUntil <= now
    );
    expired.forEach(playFor);
    if (fresh.length === 0 && expired.length === 0) return;
    const expiredKeys = new Set(expired.map((r) => r.key));
    setShown((prev) => [
      ...prev.map((r) =>
        expiredKeys.has(r.key) ? { ...r, snoozedUntil: undefined } : r
      ),
      ...fresh,
    ]);
  });

  useEffect(() => {
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const nextSnoozeEnd = shown.reduce<number | null>(
    (min, r) =>
      r.snoozedUntil !== undefined && (min === null || r.snoozedUntil < min)
        ? r.snoozedUntil
        : min,
    null
  );
  // A dedicated timer so a re-alert lands on time, not on the next tick.
  useEffect(() => {
    if (nextSnoozeEnd === null) return undefined;
    const id = window.setTimeout(
      tick,
      Math.max(0, nextSnoozeEnd - Date.now()) + 50
    );
    return () => window.clearTimeout(id);
  }, [nextSnoozeEnd]);

  const dismiss = (key: string) => {
    rememberDismissed(key);
    setShown((prev) =>
      prev.map((r) => (r.key === key ? { ...r, leaving: true } : r))
    );
    window.setTimeout(
      () => setShown((prev) => prev.filter((r) => r.key !== key)),
      LEAVE_MS
    );
  };

  const snooze = (key: string, minutes: number) => {
    const until = snoozeDeadline(minutes);
    setShown((prev) =>
      prev.map((r) => (r.key === key ? { ...r, snoozedUntil: until } : r))
    );
  };

  if (shown.length === 0) return null;

  return createPortal(
    <div
      className="fixed right-6 bottom-6 flex flex-col items-end gap-3 pointer-events-none"
      style={{ zIndex: Z_INDEX.groupReminder }}
      data-testid="group-reminder-layer"
    >
      {shown.map((r) => {
        const reminder = r.group.reminder;
        const snoozeMinutes = reminder?.snoozeMinutes ?? 3;
        return (
          <div
            key={r.key}
            className={`pointer-events-auto ${
              r.leaving
                ? 'animate-out slide-out-to-right-full fade-out duration-500 fill-mode-forwards'
                : 'animate-in slide-in-from-bottom-full fade-in duration-1000 ease-out'
            } motion-reduce:animate-none`}
          >
            <GroupReminderCard
              symbol={r.group.symbol}
              message={
                reminder?.showMessage
                  ? reminder.message.trim() || defaultMessage
                  : undefined
              }
              name={
                reminder?.showName && r.group.name.trim()
                  ? r.group.name.trim()
                  : undefined
              }
              time={
                reminder?.showTime
                  ? formatReminderTime(reminder.time)
                  : undefined
              }
              snoozeMinutes={snoozeMinutes}
              snoozedUntil={
                r.snoozedUntil !== undefined
                  ? new Date(r.snoozedUntil).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : undefined
              }
              onSnooze={() => snooze(r.key, snoozeMinutes)}
              onDismiss={() => dismiss(r.key)}
            />
          </div>
        );
      })}
    </div>,
    document.body
  );
};
