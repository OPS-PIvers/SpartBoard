import React, { useMemo } from 'react';
import { WidgetData, UrlWidgetConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Globe, QrCode } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { getUrlIcon, DEFAULT_URL_COLOR } from './icons';

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
              {urls.map((urlItem) => {
                const Icon = getUrlIcon(urlItem.icon);
                const label = getDisplayLabel(urlItem.title, urlItem.url);
                return (
                  <div
                    key={urlItem.id}
                    className="relative overflow-hidden rounded-[min(16px,3cqmin)] transition-all group shadow-sm hover:shadow-md border border-white/20 hover:brightness-110"
                    style={{
                      backgroundColor: urlItem.color ?? DEFAULT_URL_COLOR,
                      containerType: 'size',
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
                      aria-label={`Open ${label}`}
                      className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer text-left transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-black/0 group-hover:bg-black/5 group-active:bg-black/10 transition-colors pointer-events-none"
                      />

                      <Icon
                        className="text-white drop-shadow-sm z-10"
                        style={{
                          width: 'min(96px, 32cqmin)',
                          height: 'min(96px, 32cqmin)',
                          marginBottom: 'min(8px, 2.5cqmin)',
                        }}
                      />

                      <span
                        className="font-black text-white text-center leading-tight drop-shadow-md break-words max-w-full z-10 line-clamp-2"
                        style={{
                          fontSize: 'min(24px, 8cqmin)',
                          padding: '0 min(8px, 1.5cqmin)',
                        }}
                      >
                        {label}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        addWidget('qr', { config: { url: urlItem.url } })
                      }
                      className="absolute z-20 rounded-full bg-black/20 text-white opacity-70 transition-all outline-none hover:bg-black/40 group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
                      style={{
                        top: 'min(8px, 2cqmin)',
                        right: 'min(8px, 2cqmin)',
                        padding: 'min(6px, 1.5cqmin)',
                      }}
                      title="Create QR Code"
                      aria-label="Create QR Code"
                    >
                      <QrCode
                        style={{
                          width: 'min(20px, 10cqmin)',
                          height: 'min(20px, 10cqmin)',
                        }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      }
    />
  );
};
