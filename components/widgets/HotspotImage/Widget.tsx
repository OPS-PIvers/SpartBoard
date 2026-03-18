import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, HotspotImageConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { MapPin, Search, Info, HelpCircle, Star, X } from 'lucide-react';

const ICON_MAP = {
  search: Search,
  info: Info,
  question: HelpCircle,
  star: Star,
};

export const HotspotImageWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as HotspotImageConfig;
  const [activePinId, setActivePinId] = React.useState<string | null>(null);

  const handlePinClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActivePinId(id === activePinId ? null : id);

    // Find the hotspot that was clicked
    const currentHotspots = config.hotspots ?? [];
    const clickedHotspot = currentHotspots.find((h) => h.id === id);

    // Mark as viewed only if it isn't already
    if (clickedHotspot && !clickedHotspot.isViewed) {
      const newHotspots = currentHotspots.map((h) =>
        h.id === id ? { ...h, isViewed: true } : h
      );
      updateWidget(widget.id, {
        config: { ...config, hotspots: newHotspots },
      });
    }
  };

  const handleClosePopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActivePinId(null);
  };

  const emptyState = (
    <ScaledEmptyState
      icon={MapPin}
      title="No Image Uploaded"
      subtitle="Click Settings to upload a base image."
    />
  );

  return (
    <WidgetLayout
      padding="p-0"
      contentClassName="w-full h-full relative"
      content={
        config.baseImageUrl ? (
          <div
            className="w-full h-full relative bg-slate-900 overflow-hidden flex items-center justify-center"
            onClick={() => setActivePinId(null)}
          >
            {/* The actual image constraint container so pins align properly */}
            <div
              className="relative max-w-full max-h-full flex items-center justify-center"
              style={{ aspectRatio: 'auto' }}
            >
              <img
                src={config.baseImageUrl}
                alt="Base Hotspot Image"
                className="max-w-full max-h-full object-contain pointer-events-none"
              />

              {config.hotspots?.map((spot) => {
                const IconComponent = ICON_MAP[spot.icon] || Info;
                const isActive = activePinId === spot.id;

                let popoverPositionClass = '';
                let popoverMarginStyle: React.CSSProperties = {};

                if (spot.xPct < 25) {
                  popoverPositionClass += ' left-0';
                } else if (spot.xPct > 75) {
                  popoverPositionClass += ' right-0';
                } else {
                  popoverPositionClass += ' left-1/2 -translate-x-1/2';
                }

                if (spot.yPct > 75) {
                  popoverPositionClass += ' bottom-full';
                  popoverMarginStyle = { marginBottom: 'min(12px, 3cqmin)' };
                } else {
                  popoverPositionClass += ' top-full';
                  popoverMarginStyle = { marginTop: 'min(12px, 3cqmin)' };
                }

                return (
                  <div
                    key={spot.id}
                    className="absolute z-10"
                    style={{
                      left: `${spot.xPct}%`,
                      top: `${spot.yPct}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <button
                      aria-label={`Open hotspot: ${spot.title || 'Untitled'}`}
                      onClick={(e) => handlePinClick(spot.id, e)}
                      className={`relative flex items-center justify-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-blue-400
                        ${
                          isActive
                            ? 'bg-blue-600 text-white scale-110 shadow-lg shadow-blue-500/50 z-20'
                            : spot.isViewed
                              ? 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
                              : 'bg-emerald-500 text-white hover:bg-emerald-400 animate-pulse hover:animate-none shadow-md shadow-emerald-500/50'
                        }
                      `}
                      style={{ padding: 'min(10px, 2.5cqmin)' }}
                    >
                      <IconComponent
                        style={{
                          width: 'min(20px, 5cqmin)',
                          height: 'min(20px, 5cqmin)',
                        }}
                      />
                    </button>

                    {isActive && (
                      <div
                        style={{
                          width: 'min(256px, 64cqmin)',
                          ...popoverMarginStyle,
                          padding: 'min(16px, 4cqmin)',
                        }}
                        className={`absolute ${popoverPositionClass} rounded-xl shadow-xl text-center cursor-default
                          ${
                            config.popoverTheme === 'dark'
                              ? 'bg-slate-800 text-white border border-slate-700'
                              : config.popoverTheme === 'glass'
                                ? 'bg-white/80 backdrop-blur-md text-slate-900 border border-white/40'
                                : 'bg-white text-slate-900 border border-slate-200'
                          }
                        `}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="flex justify-center items-start relative"
                          style={{ marginBottom: 'min(8px, 2cqmin)' }}
                        >
                          <h4
                            className="font-bold leading-tight"
                            style={{ fontSize: 'min(18px, 4.5cqmin)' }}
                          >
                            {spot.title}
                          </h4>
                          <button
                            aria-label="Close popover"
                            onClick={handleClosePopover}
                            className="text-slate-400 hover:text-slate-600 transition-colors absolute right-0 top-0"
                            style={{
                              padding: 'min(4px, 1cqmin)',
                              marginRight: 'min(-8px, -2cqmin)',
                              marginTop: 'min(-8px, -2cqmin)',
                            }}
                          >
                            <X
                              style={{
                                width: 'min(16px, 4cqmin)',
                                height: 'min(16px, 4cqmin)',
                              }}
                            />
                          </button>
                        </div>
                        <p
                          className="opacity-90 leading-relaxed whitespace-pre-wrap"
                          style={{ fontSize: 'min(14px, 3.5cqmin)' }}
                        >
                          {spot.detailText}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          emptyState
        )
      }
    />
  );
};
