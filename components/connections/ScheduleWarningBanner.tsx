import React, { useEffect, useState } from 'react';
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
// An alert older than this was already played by another page, so it is not replayed here.
const FRESH_MS = 20_000;

// Plays a Schedule block warning's sound and shows its message across the board.
export const ScheduleWarningBanner: React.FC = () => {
  const { t } = useTranslation();
  const { activeDashboard } = useDashboard();
  const { canAccessFeature } = useAuth();
  const enabled = canAccessFeature('widget-connections');
  const [mountedAt] = useState(() => Date.now());
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
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

  // A new alert shows once; one saved before this page opened was already played elsewhere.
  if (latest && !handled.has(latest.id)) {
    setHandled(new Set([...handled, latest.id]));
    if (latest.at >= mountedAt - FRESH_MS) setShown(latest);
  }

  const shownId = shown?.id;
  const shownSound = shown?.sound;
  useEffect(() => {
    if (!shownId || !shownSound) return;
    playTimerAlert(shownSound);
    queueMicrotask(() => setSoundBlocked(getAudioCtx()?.state === 'suspended'));
  }, [shownId, shownSound]);

  useEffect(() => {
    if (!shownId || soundBlocked) return;
    const id = window.setTimeout(() => setShown(null), SHOW_MS);
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
      className="fixed left-1/2 top-4 flex max-w-[90vw] -translate-x-1/2 items-center gap-4 rounded-2xl bg-brand-blue-primary px-6 py-4 text-white shadow-2xl"
      style={{ zIndex: Z_INDEX.toast }}
      role="status"
      aria-live="polite"
    >
      <BellRing className="h-8 w-8 shrink-0" aria-hidden="true" />
      {/* no-tour-anchor: a transient alert that appears on its own, never something a tour points at */}
      <button
        type="button"
        onClick={() => setShown(null)}
        className="min-h-11 text-left text-2xl font-bold"
      >
        {t('connections.scheduleWarning.banner', {
          task: shown.task.trim() || t('connections.scheduleWarning.thisBlock'),
          minutes: shown.minutes,
          defaultValue: '{{task}} ends in {{minutes}} min',
        })}
      </button>
      {soundBlocked && (
        // no-tour-anchor: shows only when the browser blocked sound, never part of a tour
        <button
          type="button"
          onClick={enableSound}
          className="min-h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-bold text-brand-blue-primary"
        >
          {t('connections.scheduleWarning.enableSound', {
            defaultValue: 'Enable classroom sounds',
          })}
        </button>
      )}
    </div>
  );
};
