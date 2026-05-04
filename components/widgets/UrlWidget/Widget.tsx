import React, { useMemo } from 'react';
import { WidgetData, UrlWidgetConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Globe } from 'lucide-react';
import { isSafeIconUrl } from '@/components/widgets/Catalyst/catalystHelpers';
import { getUrlIcon, DEFAULT_URL_COLOR } from './icons';

const getDisplayLabel = (title?: string, url?: string) => {
  const trimmedTitle = title?.trim();
  return trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : url;
};

export const UrlWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const config = widget.config as UrlWidgetConfig;
  const urls = config.urls ?? [];

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
        <div className="h-full w-full flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            <div
              className="grid h-full w-full"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                gap: 'min(6px, 1.5cqmin)',
              }}
            >
              {urls.map((urlItem) => {
                const Icon = getUrlIcon(urlItem.icon);
                const label = getDisplayLabel(urlItem.title, urlItem.url);
                const isCircle = urlItem.shape === 'circle';
                const trimmedImage = urlItem.imageUrl?.trim();
                const hasImage = trimmedImage
                  ? isSafeIconUrl(trimmedImage)
                  : false;
                const radiusClass = isCircle
                  ? 'rounded-full'
                  : 'rounded-[min(16px,3cqmin)]';
                // Wrap the tile in a centering cell so a circle (which forces
                // aspect-square) sits centered inside its grid cell rather
                // than collapsing to one edge.
                return (
                  <div
                    key={urlItem.id}
                    className="relative flex items-center justify-center min-w-0 min-h-0"
                  >
                    <div
                      className={`relative overflow-hidden transition-all group shadow-sm hover:shadow-md border border-white/20 hover:brightness-110 ${radiusClass} ${
                        isCircle
                          ? 'aspect-square max-w-full max-h-full'
                          : 'h-full w-full'
                      }`}
                      style={{
                        ...(isCircle
                          ? { height: '100%', width: 'auto' }
                          : null),
                        backgroundColor: hasImage
                          ? '#1e293b'
                          : (urlItem.color ?? DEFAULT_URL_COLOR),
                        containerType: 'size',
                      }}
                    >
                      {hasImage && (
                        <img
                          src={trimmedImage}
                          alt=""
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        />
                      )}
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
                          className={`absolute inset-0 bg-black/0 group-hover:bg-black/5 group-active:bg-black/10 transition-colors pointer-events-none ${radiusClass}`}
                        />

                        {hasImage ? (
                          // Image mode: bottom text plate, no icon (image IS the visual).
                          <span
                            className="absolute left-0 right-0 bottom-0 z-10 font-black text-white text-center leading-tight break-words px-1.5"
                            style={{
                              fontSize: 'clamp(11px, 9cqmin, 28px)',
                              padding: 'min(8px, 4cqmin) min(10px, 5cqmin)',
                              backgroundColor: 'rgba(15, 23, 42, 0.42)',
                              backdropFilter: 'blur(min(4px, 2cqmin))',
                              WebkitBackdropFilter: 'blur(min(4px, 2cqmin))',
                            }}
                          >
                            {label}
                          </span>
                        ) : (
                          // Color mode: large icon + label centered.
                          <>
                            <Icon
                              className="text-white drop-shadow-sm z-10"
                              style={{
                                width: 'min(120px, 38cqmin)',
                                height: 'min(120px, 38cqmin)',
                                marginBottom: 'min(4px, 1.5cqmin)',
                              }}
                            />
                            <span
                              className="font-black text-white text-center leading-tight drop-shadow-md break-words max-w-full z-10"
                              style={{
                                fontSize: 'clamp(11px, 9cqmin, 28px)',
                                padding: '0 min(6px, 1.5cqmin)',
                              }}
                            >
                              {label}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
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
