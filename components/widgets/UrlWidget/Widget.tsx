import React, { useMemo } from 'react';
import { WidgetData, UrlWidgetConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Globe, ExternalLink, QrCode } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';

export const UrlWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { addWidget } = useDashboard();
  const config = widget.config as UrlWidgetConfig;
  const urls = config.urls ?? [];
  const getDisplayLabel = (title?: string, url?: string) => {
    const trimmedTitle = title?.trim();
    return trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : url;
  };

  // Calculate grid layout based on number of active URLs
  const { cols, rows } = useMemo(() => {
    const count = urls.length;
    if (count === 0) return { cols: 1, rows: 1 };
    if (count <= 2) return { cols: count, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    if (count <= 12) return { cols: 4, rows: 3 };
    if (count <= 16) return { cols: 4, rows: 4 };
    return { cols: 5, rows: Math.ceil(count / 5) };
  }, [urls.length]);

  if (urls.length === 0) {
    return (
      <ScaledEmptyState
        icon={Globe}
        title="No Links Added"
        subtitle="Flip to set up your URLs."
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="h-full w-full flex flex-col overflow-hidden"
          style={{ padding: 'min(12px, 2.5cqmin)' }}
        >
          <div className="flex-1 min-h-0">
            <div
              className="grid h-full w-full"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                gap: 'min(10px, 2cqmin)',
              }}
            >
              {urls.map((urlItem) => (
                <div
                  key={urlItem.id}
                  className="relative overflow-hidden rounded-[min(16px,3cqmin)] flex flex-col items-center justify-center transition-all group shadow-sm hover:shadow-md border border-white/20 hover:brightness-110"
                  style={{ backgroundColor: urlItem.color ?? '#10b981' }}
                >
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />

                  <div
                    className="flex items-center justify-center z-10"
                    style={{
                      marginBottom: 'min(6px, 1.5cqmin)',
                      gap: 'min(16px, 3cqmin)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          urlItem.url,
                          '_blank',
                          'noopener,noreferrer'
                        )
                      }
                      className="transition-transform active:scale-90 hover:scale-110 focus:outline-none"
                      title="Open in new tab"
                    >
                      <ExternalLink
                        className="text-white drop-shadow-sm"
                        style={{
                          width: 'min(40px, 12cqmin)',
                          height: 'min(40px, 12cqmin)',
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        addWidget('qr', { config: { url: urlItem.url } })
                      }
                      className="transition-transform active:scale-90 hover:scale-110 focus:outline-none"
                      title="Create QR Code"
                    >
                      <QrCode
                        className="text-white drop-shadow-sm"
                        style={{
                          width: 'min(40px, 12cqmin)',
                          height: 'min(40px, 12cqmin)',
                        }}
                      />
                    </button>
                  </div>
                  <span
                    className="font-black text-white text-center leading-tight drop-shadow-md break-words max-w-full z-10"
                    style={{
                      fontSize: 'min(18px, 6cqmin)',
                      padding: '0 min(8px, 1.5cqmin)',
                    }}
                  >
                    {getDisplayLabel(urlItem.title, urlItem.url)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
};
