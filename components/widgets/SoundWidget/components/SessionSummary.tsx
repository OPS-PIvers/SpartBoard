import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, X } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import type { WidgetType } from '@/types';
import { POSTER_LEVELS } from '../constants';
import type { NoiseSession } from '../useNoiseSession';
import { formatDuration } from '../noiseTarget';

// Memoized: the widget re-renders every frame, the session only once a second.
export const SessionSummary = React.memo<{
  session: NoiseSession;
  widgetId: string;
  widgetType: WidgetType;
  onClose: () => void;
  onClear: () => void;
}>(function SessionSummary({
  session,
  widgetId,
  widgetType,
  onClose,
  onClear,
}) {
  const { t } = useTranslation();
  const total = session.seconds.reduce((a, b) => a + b, 0);
  const longest = Math.max(1, ...session.seconds);
  const starts: number[] = [];
  for (let i = 0, at = 0; i < session.runs.length; i++) {
    starts.push(at);
    at += session.runs[i].seconds;
  }

  return (
    <div
      className="absolute inset-0 flex flex-col bg-white text-slate-800"
      style={{
        margin: 'min(8px, 2cqmin)',
        padding: 'min(14px, 3.5cqmin)',
        gap: 'min(10px, 2.5cqmin)',
        borderRadius: 'min(16px, 4cqmin)',
      }}
    >
      <div className="flex items-center" style={{ gap: 'min(8px, 2cqmin)' }}>
        <h3
          className="flex-1 font-black truncate"
          style={{ fontSize: 'min(26px, 6.5cqmin)' }}
        >
          {t('widgets.sound.timeAtEachLevel')}
        </h3>
        <button
          type="button"
          onClick={onClear}
          aria-label={t('widgets.sound.clearSummary')}
          title={t('widgets.sound.clearSummary')}
          className="relative touch-target-expand rounded-full text-slate-600 hover:bg-slate-100 flex items-center justify-center"
          style={{ width: 'min(32px, 9cqmin)', height: 'min(32px, 9cqmin)' }}
          {...tourAttr('sound.clear-summary', widgetId, widgetType)}
        >
          <Trash2
            aria-hidden="true"
            style={{ width: 'min(16px, 5cqmin)', height: 'min(16px, 5cqmin)' }}
          />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('widgets.sound.closeSummary')}
          title={t('widgets.sound.closeSummary')}
          className="relative touch-target-expand rounded-full text-slate-600 hover:bg-slate-100 flex items-center justify-center"
          style={{ width: 'min(32px, 9cqmin)', height: 'min(32px, 9cqmin)' }}
          {...tourAttr('sound.close-summary', widgetId, widgetType)}
        >
          <X
            aria-hidden="true"
            style={{
              width: 'min(18px, 5.5cqmin)',
              height: 'min(18px, 5.5cqmin)',
            }}
          />
        </button>
      </div>

      <ul
        className="grid items-center min-h-0 overflow-y-auto pb-1"
        style={{
          gridTemplateColumns: 'auto 1fr auto',
          gap: 'min(10px, 2cqmin) min(8px, 2cqmin)',
          fontSize: 'min(20px, 5cqmin)',
        }}
      >
        {POSTER_LEVELS.map((level, i) => (
          <li key={level.label} className="contents">
            <span className="font-bold whitespace-nowrap">{level.label}</span>
            <span
              className="rounded-full bg-slate-100 overflow-hidden"
              style={{ height: 'min(14px, 3cqmin)' }}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(session.seconds[i] / longest) * 100}%`,
                  backgroundColor: level.color,
                }}
              />
            </span>
            <span className="tabular-nums font-semibold text-slate-600">
              {formatDuration(session.seconds[i])}
            </span>
          </li>
        ))}
      </ul>

      {total > 0 && (
        <svg
          viewBox={`0 0 ${total} 1`}
          preserveAspectRatio="none"
          className="w-full shrink-0 rounded-sm"
          style={{ height: 'min(28px, 5cqmin)' }}
          role="img"
          aria-label={t('widgets.sound.timeline')}
        >
          {session.runs.map((run, i) => {
            return (
              <rect
                key={i}
                x={starts[i]}
                y={0}
                width={run.seconds}
                height={1}
                fill={POSTER_LEVELS[run.level].color}
              />
            );
          })}
        </svg>
      )}

      <p
        className="font-semibold text-slate-700 mt-auto"
        style={{ fontSize: 'min(20px, 5cqmin)' }}
      >
        {t('widgets.sound.alertCount', { count: session.alerts })}
        {' · '}
        {t('widgets.sound.listenedFor', { time: formatDuration(total) })}
      </p>
    </div>
  );
});
