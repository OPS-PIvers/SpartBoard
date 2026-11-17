import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { Z_INDEX } from '@/config/zIndex';
import type { ScheduleConfig, ScheduleWarningAlert } from '@/types';
import {
  getAudioCtx,
  playTimerAlert,
  resumeAudio,
} from '@/utils/timeToolAudio';

const SHOW_MS = 10_000;
// An alert older than this was already played, so it is not replayed.
const FRESH_MS = 20_000;

// Plays a Schedule block warning's sound and shows its message across the board.
export const ScheduleWarningBanner: React.FC = () => {
  const { t } = useTranslation();
  const { activeDashboard } = useDashboard();
  const { canAccessFeature } = useAuth();
  const enabled = canAccessFeature('widget-connections');
  const handled = useRef(new Set<string>());
  const [shown, setShown] = useState<ScheduleWarningAlert | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);

  let latest: ScheduleWarningAlert | undefined;
  if (enabled) {
    for (const w of activeDashboard?.widgets ?? []) {
      if (w.type !== 'schedule' && w.type !== 'specialist-schedule') continue;
      const a = (w.config as ScheduleConfig).warningAlert;
      if (a && (!latest || a.at > latest.at)) latest = a;
    }
  }

  const alertId = latest?.id;
  const alertAt = latest?.at;
  const alertTask = latest?.task;
  const alertMinutes = latest?.minutes;
  const alertSound = latest?.sound;

  // A new alert plays once, when first seen; an old one (another board, or saved before this page opened) is skipped.
  useEffect(() => {
    if (
      alertId === undefined ||
      alertAt === undefined ||
      alertTask === undefined ||
      alertMinutes === undefined ||
      alertSound === undefined ||
      handled.current.has(alertId)
    ) {
      return;
    }
    handled.current.add(alertId);
    if (Date.now() - alertAt > FRESH_MS) return;
    playTimerAlert(alertSound);
    queueMicrotask(() => {
      setShown({
        id: alertId,
        at: alertAt,
        task: alertTask,
        minutes: alertMinutes,
        sound: alertSound,
      });
      setSoundBlocked(getAudioCtx()?.state === 'suspended');
    });
  }, [alertId, alertAt, alertTask, alertMinutes, alertSound]);

  const shownId = shown?.id;

  useEffect(() => {
    if (!shownId) return;
    // A blocked sound keeps the banner up longer so someone can enable it, but an unattended board still clears.
    const id = window.setTimeout(
      () => setShown(null),
      soundBlocked ? SHOW_MS * 6 : SHOW_MS
    );
    return () => window.clearTimeout(id);
  }, [shownId, soundBlocked]);

  if (!shown) return null;

  const enableSound = () => {
    void resumeAudio().then(() => {
      playTimerAlert(shown.sound);
      setSoundBlocked(false);
    });
  };

  return (
    <div
      className="fixed left-1/2 top-[10vh] flex w-[min(92vw,64rem)] -translate-x-1/2 flex-col items-center gap-4"
      style={{ zIndex: Z_INDEX.toast }}
      role="status"
      aria-live="polite"
    >
      {/* no-tour-anchor: a transient alert that appears on its own, never something a tour points at */}
      <button
        type="button"
        onClick={() => setShown(null)}
        className="flex w-full flex-col items-center gap-3 rounded-3xl border-4 border-white/40 bg-brand-blue-primary px-8 py-8 text-center text-white shadow-2xl"
      >
        <BellRing
          className="shrink-0"
          style={{
            width: 'clamp(3rem, 9vw, 6.5rem)',
            height: 'clamp(3rem, 9vw, 6.5rem)',
          }}
          aria-hidden="true"
        />
        <span
          className="font-black leading-tight"
          style={{ fontSize: 'clamp(2.25rem, 7vw, 6rem)' }}
        >
          {shown.task.trim() || t('connections.scheduleWarning.thisBlock')}
        </span>
        <span
          className="font-bold"
          style={{ fontSize: 'clamp(1.75rem, 4.5vw, 3.75rem)' }}
        >
          {t('connections.scheduleWarning.endsIn', {
            minutes: shown.minutes,
            defaultValue: 'Ends in {{minutes}} min',
          })}
        </span>
      </button>
      {soundBlocked && (
        // no-tour-anchor: shows only when the browser blocked sound, never part of a tour
        <button
          type="button"
          onClick={enableSound}
          className="min-h-12 rounded-2xl bg-white px-6 text-lg font-bold text-brand-blue-primary shadow-xl"
        >
          {t('connections.scheduleWarning.enableSound', {
            defaultValue: 'Enable classroom sounds',
          })}
        </button>
      )}
    </div>
  );
};
