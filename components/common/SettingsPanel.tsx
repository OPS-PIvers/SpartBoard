import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { WidgetData, GlobalStyle } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { useWindowSize } from '@/hooks/useWindowSize';

interface SettingsPanelProps {
  widget: WidgetData;
  widgetRef: React.RefObject<HTMLDivElement | null>;
  settings: React.ReactNode;
  appearanceSettings?: React.ReactNode;
  shouldRenderSettings: boolean;
  onClose: () => void;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  globalStyle: GlobalStyle;
  title: string;
}

const PANEL_WIDTH = 380;
const PANEL_MARGIN = 12;

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  widget,
  widgetRef,
  settings,
  appearanceSettings,
  shouldRenderSettings,
  onClose,
  updateWidget,
  globalStyle,
  title,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'style'>('settings');
  const viewport = useWindowSize();

  const transparency = widget.transparency ?? globalStyle.windowTransparency;

  // Clamp panel width so it never overflows narrow viewports
  const effectiveWidth = Math.min(
    PANEL_WIDTH,
    viewport.width - 2 * PANEL_MARGIN
  );

  // Compute panel position from widget props + viewport (no DOM measurement)
  const position = useMemo(() => {
    const { width: vw, height: vh } = viewport;
    const panelMaxH = vh * 0.8;
    const pw = Math.min(PANEL_WIDTH, vw - 2 * PANEL_MARGIN);

    // Maximized widgets: center the panel
    if (widget.maximized) {
      return {
        top: Math.max(PANEL_MARGIN, (vh - panelMaxH) / 2),
        left: Math.max(PANEL_MARGIN, (vw - pw) / 2),
      };
    }

    const widgetRight = widget.x + widget.w;
    const widgetLeft = widget.x;
    const widgetTop = widget.y;

    // Vertical: align top with widget, clamped to viewport
    const top = Math.max(
      PANEL_MARGIN,
      Math.min(widgetTop, vh - panelMaxH - PANEL_MARGIN)
    );

    // Try right side of widget
    const rightX = widgetRight + PANEL_MARGIN;
    if (rightX + pw + PANEL_MARGIN <= vw) {
      return { top, left: rightX };
    }

    // Try left side of widget
    const leftX = widgetLeft - PANEL_MARGIN - pw;
    if (leftX >= PANEL_MARGIN) {
      return { top, left: leftX };
    }

    // Fallback: center horizontally
    return {
      top,
      left: Math.max(PANEL_MARGIN, (vw - pw) / 2),
    };
  }, [widget.x, widget.y, widget.w, widget.maximized, viewport]);

  // Animate in on mount (track both rAF handles for safe cleanup)
  useEffect(() => {
    let outerRaf = 0;
    let innerRaf = 0;
    outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setIsVisible(true));
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Click outside to close (exclude widget itself and tool menu)
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        widgetRef.current &&
        !widgetRef.current.contains(target) &&
        !target.closest('[data-settings-exclude]')
      ) {
        onClose();
      }
    };

    // Small delay to avoid closing on the same click that opened
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onClose, widgetRef]);

  return createPortal(
    <div
      ref={panelRef}
      className={`font-${globalStyle.fontFamily}`}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: effectiveWidth,
        maxHeight: '80vh',
        zIndex: Z_INDEX.popover,
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? 'translateY(0) scale(1)'
          : 'translateY(8px) scale(0.98)',
        transition: 'opacity 0.15s ease, transform 0.15s ease',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col"
        style={{ maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-50/80 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-sm font-bold text-slate-800 truncate">
              {widget.customTitle ?? title}
            </span>
          </div>
          <IconButton
            onClick={onClose}
            icon={<X className="w-4 h-4" />}
            label="Close settings"
            title="Close settings (Esc)"
            variant="ghost"
            size="sm"
            shape="square"
            className="shrink-0"
          />
        </div>

        {/* Tab bar */}
        <div className="flex bg-slate-100 p-1 mx-5 mt-3 mb-1 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-1.5 text-xxs font-black uppercase tracking-widest rounded-lg transition-all ${
              activeTab === 'settings'
                ? 'bg-white shadow-sm text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('style')}
            className={`flex-1 py-1.5 text-xxs font-black uppercase tracking-widest rounded-lg transition-all ${
              activeTab === 'style'
                ? 'bg-white shadow-sm text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Style
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Settings tab */}
          {activeTab === 'settings' && (
            <div className="px-5 py-4">
              {shouldRenderSettings && settings ? (
                settings
              ) : (
                <div className="text-slate-500 italic text-sm">
                  Standard settings available.
                </div>
              )}
            </div>
          )}

          {/* Style tab */}
          {activeTab === 'style' && (
            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Widget-specific appearance settings */}
              {shouldRenderSettings && appearanceSettings && (
                <div>{appearanceSettings}</div>
              )}

              {/* Universal: Transparency */}
              <div className="flex flex-col gap-2 bg-slate-50/80 px-4 py-3 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                    Transparency{' '}
                    {widget.transparency === undefined ? '(Global)' : ''}
                  </span>
                  {widget.transparency !== undefined && (
                    <button
                      type="button"
                      onClick={() =>
                        updateWidget(widget.id, { transparency: undefined })
                      }
                      className="text-xxs font-black text-indigo-600 hover:text-indigo-700 uppercase"
                      aria-label="Reset transparency to global default"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={transparency}
                    onChange={(e) =>
                      updateWidget(widget.id, {
                        transparency: parseFloat(e.target.value),
                      })
                    }
                    className="flex-1 accent-indigo-600 h-1.5"
                    aria-label="Transparency percentage"
                  />
                  <span className="text-xs font-mono font-bold text-slate-500 w-10 text-right">
                    {Math.round(transparency * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
