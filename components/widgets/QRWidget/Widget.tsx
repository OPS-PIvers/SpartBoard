import React, { useEffect } from 'react';
import { useDashboard } from '../../../context/useDashboard';
import { WidgetData, QRConfig, TextConfig } from '../../../types';
import { Link } from 'lucide-react';
import { WidgetLayout } from '../WidgetLayout';

const stripHtml = (html: string) => {
  if (typeof DOMParser === 'undefined') {
    // Basic fallback for SSR environments to remove HTML tags.
    return html.replace(/<[^>]*>?/gm, '');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
};

export const QRWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { activeDashboard, updateWidget } = useDashboard();
  const config = widget.config as QRConfig;
  const url = config.url ?? 'https://google.com';

  // Nexus Connection: Link Repeater (Text -> QR)
  useEffect(() => {
    if (config.syncWithTextWidget && activeDashboard?.widgets) {
      const textWidget = activeDashboard.widgets.find((w) => w.type === 'text');
      if (textWidget) {
        const textConfig = textWidget.config as TextConfig;
        const plainText = stripHtml(textConfig.content || '').trim();

        if (plainText && plainText !== config.url) {
          updateWidget(widget.id, {
            config: { url: plainText, syncWithTextWidget: true } as QRConfig,
          });
        }
      }
    }
  }, [
    config.syncWithTextWidget,
    activeDashboard?.widgets,
    config.url,
    widget.id,
    updateWidget,
  ]);

  // Use a simple public API for QR codes
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(
    url
  )}`;

  return (
    <WidgetLayout
      padding="p-0"
      header={
        config.syncWithTextWidget ? (
          <div
            className="flex justify-end"
            style={{ padding: 'min(8px, 1.5cqmin)', paddingBottom: 0 }}
          >
            <div
              className="flex items-center bg-indigo-50 rounded-full border border-indigo-100 animate-in fade-in zoom-in shadow-sm"
              style={{
                gap: 'min(4px, 1cqmin)',
                paddingLeft: 'min(8px, 2cqmin)',
                paddingRight: 'min(8px, 2cqmin)',
                paddingTop: 'min(4px, 1cqmin)',
                paddingBottom: 'min(4px, 1cqmin)',
              }}
            >
              <Link
                className="text-indigo-500"
                style={{
                  width: 'min(12px, 3cqmin)',
                  height: 'min(12px, 3cqmin)',
                }}
              />
              <span
                className="font-black text-indigo-500 uppercase tracking-wide"
                style={{ fontSize: 'min(10px, 3cqmin)' }}
              >
                Linked
              </span>
            </div>
          </div>
        ) : undefined
      }
      content={
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ padding: 'min(8px, 1.5cqmin)' }}
        >
          <div
            className="bg-white rounded-2xl shadow-inner w-full h-full flex items-center justify-center border border-slate-100 overflow-hidden"
            style={{ padding: 'min(8px, 1.5cqmin)' }}
          >
            <img
              src={qrUrl}
              alt="QR Code"
              className="w-full h-full object-contain mix-blend-multiply transition-transform hover:scale-105 duration-500"
            />
          </div>
        </div>
      }
      footer={
        <div
          style={{
            paddingLeft: 'min(12px, 2.5cqmin)',
            paddingRight: 'min(12px, 2.5cqmin)',
            paddingBottom: 'min(12px, 2.5cqmin)',
          }}
        >
          <div
            className="font-mono text-slate-400 break-all text-center max-w-full overflow-hidden bg-slate-50/50 rounded-lg border border-slate-100/50"
            style={{
              fontSize: 'min(14px, 4cqmin)',
              paddingTop: 'min(6px, 1.5cqmin)',
              paddingBottom: 'min(6px, 1.5cqmin)',
              paddingLeft: 'min(12px, 2.5cqmin)',
              paddingRight: 'min(12px, 2.5cqmin)',
            }}
          >
            {url}
          </div>
        </div>
      }
    />
  );
};
