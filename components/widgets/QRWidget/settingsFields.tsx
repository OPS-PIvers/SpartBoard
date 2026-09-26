import React from 'react';
import { AlertCircle, Link } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import type { QRConfig, WidgetData } from '@/types';
import { useTranslation } from 'react-i18next';
import { deriveSyncedUrl } from './deriveSyncedUrl';
import { tourAttr } from '@/config/tourAnchors';

export const QRDestinationField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { activeDashboard } = useDashboard();
  const config = ctx.config as QRConfig;
  const syncedUrl = deriveSyncedUrl(config, activeDashboard?.widgets);
  const value = config.syncWithTextWidget
    ? (syncedUrl ?? '')
    : (config.url ?? '');

  return (
    <input
      id={ctx.id}
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      type="text"
      value={value}
      onChange={(event) => ctx.updateConfig({ url: event.target.value })}
      disabled={config.syncWithTextWidget}
      className="w-full rounded-lg border border-slate-200 p-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
      placeholder="https://..."
      {...tourAttr('widget-settings.qr.url', ctx.widget.id, ctx.widget.type)}
    />
  );
};

export const QRTextSyncField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { activeDashboard } = useDashboard();
  const config = ctx.config as QRConfig;
  const hasTextWidget = activeDashboard?.widgets.some(
    (widget) => widget.type === 'text'
  );

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-indigo-900">
          <Link className="h-4 w-4" />
          <span className="text-xs font-semibold">
            {ctx.t('widgetSettings.qr.syncWithTextWidget')}
          </span>
        </div>
        <Toggle
          checked={config.syncWithTextWidget ?? false}
          onChange={(checked) =>
            ctx.updateConfig({ syncWithTextWidget: checked })
          }
          label={ctx.t('widgetSettings.qr.syncWithTextWidget')}
          size="sm"
          activeColor="bg-indigo-600"
          showLabels={false}
          anchor={tourAttr(
            'widget-settings.qr.sync-text',
            ctx.widget.id,
            ctx.widget.type
          )}
        />
      </div>
      {config.syncWithTextWidget && !hasTextWidget && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-100 bg-orange-50 p-2 text-orange-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-xs">{ctx.t('widgetSettings.qr.noTextWidget')}</p>
        </div>
      )}
      <p className="text-xxs font-medium leading-relaxed text-indigo-500">
        {ctx.t('widgetSettings.qr.syncHelp')}
      </p>
    </div>
  );
};

/** Combined harness retained for focused field behavior tests; production renders the schema fields separately. */
export const QRSettingsFields: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { t } = useTranslation();
  const config = widget.config as QRConfig;
  const updateConfig = (patch: Record<string, unknown>) =>
    updateWidget(widget.id, { config: { ...config, ...patch } });
  const baseCtx = {
    config: config as Record<string, unknown>,
    widget,
    isAdmin: false,
    canAccessFeature: () => true,
    t,
    updateConfig,
    describedBy: undefined,
  };

  return (
    <div className="space-y-4">
      <label id="qr-test-url-label" className="text-xs font-semibold">
        {t('widgetSettings.qr.destinationUrl')}
      </label>
      <QRDestinationField
        ctx={{
          ...baseCtx,
          id: 'qr-test-url',
          labelId: 'qr-test-url-label',
        }}
      />
      <Toggle
        checked={config.showUrl ?? false}
        onChange={(checked) => updateConfig({ showUrl: checked })}
        label={t('widgetSettings.qr.showUrl')}
        showLabels={false}
      />
      <span id="qr-test-sync-label" className="sr-only">
        {t('widgetSettings.qr.linkRepeater')}
      </span>
      <QRTextSyncField
        ctx={{
          ...baseCtx,
          id: 'qr-test-sync',
          labelId: 'qr-test-sync-label',
        }}
      />
    </div>
  );
};
