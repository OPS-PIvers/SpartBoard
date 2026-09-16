import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, HelpCircle, RefreshCw, Trash2 } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useAuth } from '@/context/useAuth';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import type { CalendarConfig, CalendarGlobalConfig } from '@/types';
import { extractCalendarId } from './constants';

export const CalendarBuildingSyncField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { subscribeToPermission } = useFeaturePermissions();
  const buildingId = useWidgetBuildingId(ctx.widget);
  const config = ctx.config as unknown as CalendarConfig;
  const [globalConfig, setGlobalConfig] = useState<CalendarGlobalConfig | null>(
    null
  );

  useEffect(
    () =>
      subscribeToPermission('calendar', (permission) => {
        setGlobalConfig(
          permission?.config
            ? (permission.config as unknown as CalendarGlobalConfig)
            : null
        );
      }),
    [subscribeToPermission]
  );

  const lastSyncAt = buildingId
    ? globalConfig?.buildingDefaults?.[buildingId]?.lastProxySync
    : null;

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-slate-700">
          {ctx.t('widgetSettings.calendar.syncBuildingSchedule')}
        </span>
        {lastSyncAt && (
          <span className="flex items-center gap-1 text-xxs font-bold uppercase tracking-tight text-slate-400">
            <RefreshCw className="h-2.5 w-2.5" />
            {ctx.t('widgetSettings.calendar.syncedAt', {
              time: new Date(lastSyncAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </span>
        )}
      </div>
      <Toggle
        checked={config.isBuildingSyncEnabled ?? true}
        onChange={(checked) =>
          ctx.updateConfig({ isBuildingSyncEnabled: checked })
        }
      />
    </div>
  );
};

export const CalendarPersonalCalendarsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { ensureGoogleScope } = useAuth();
  const config = ctx.config as unknown as CalendarConfig;
  const personalIds = config.personalCalendarIds ?? [];
  const [isConnected, setIsConnected] = useState(false);
  const [input, setInput] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureGoogleScope('calendar.readonly').then((token) => {
      if (!cancelled && token) setIsConnected(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ensureGoogleScope]);

  const connect = useCallback(async () => {
    const token = await ensureGoogleScope('calendar.readonly', {
      interactive: true,
    });
    if (token) setIsConnected(true);
  }, [ensureGoogleScope]);

  const addCalendar = () => {
    const id = extractCalendarId(input);
    if (!id || personalIds.includes(id)) return;
    ctx.updateConfig({ personalCalendarIds: [...personalIds, id] });
    setInput('');
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="space-y-3"
    >
      <button
        type="button"
        onClick={() => setShowInstructions((visible) => !visible)}
        className="flex items-center gap-1 text-xxs font-black uppercase tracking-tight text-blue-600 hover:text-blue-700"
      >
        <HelpCircle className="h-3 w-3" />
        {ctx.t('widgetSettings.calendar.instructions')}
      </button>
      {showInstructions && (
        <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xxs text-blue-800">
          <p>{ctx.t('widgetSettings.calendar.instructionsHelp')}</p>
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-black uppercase text-blue-600 hover:underline"
          >
            {ctx.t('widgetSettings.calendar.openGoogleCalendar')}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      )}
      {!isConnected ? (
        <button
          type="button"
          onClick={() => void connect()}
          className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-white py-2.5 text-xs font-black text-slate-500 hover:border-blue-400 hover:text-blue-600"
        >
          {ctx.t('widgetSettings.calendar.connectGoogle')}
        </button>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={ctx.t(
                'widgetSettings.calendar.calendarIdPlaceholder'
              )}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={addCalendar}
              disabled={!input}
              className="rounded-lg bg-blue-600 px-4 text-xs font-black uppercase text-white disabled:opacity-50"
            >
              {ctx.t('widgetSettings.calendar.add')}
            </button>
          </div>
          <div className="space-y-1.5">
            {personalIds.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 shadow-sm"
              >
                <span className="min-w-0 truncate text-xs font-medium text-slate-600">
                  {id}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    ctx.updateConfig({
                      personalCalendarIds: personalIds.filter(
                        (calendarId) => calendarId !== id
                      ),
                    })
                  }
                  aria-label={ctx.t('widgetSettings.calendar.removeCalendar')}
                  className="p-1 text-slate-300 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
