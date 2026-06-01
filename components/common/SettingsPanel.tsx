import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { WidgetBuildingToggle } from '@/components/common/WidgetBuildingToggle';
import { WidgetData, GlobalStyle } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { UniversalStyleSettings } from '@/components/common/UniversalStyleSettings';
import { useWindowSize } from '@/hooks/useWindowSize';
import { useDashboard } from '@/context/useDashboard';

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
  // Store onClose in a ref so the click-outside and Escape effects never need to
  // list onClose as a dependency. DraggableWindow passes an inline arrow function
  // for onClose on every render, which would otherwise cause the 50ms debounce
  // timer to reset on every parent re-render (e.g., during drag-while-settings-open),
  // silently dropping any click-outside that arrives within that 50ms window.
  const onCloseRef = useRef(onClose);
  // Keep ref in sync with the latest onClose prop on every render.
  // eslint-disable-next-line react-hooks/refs
  onCloseRef.current = onClose;
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'style'>('settings');
  const viewport = useWindowSize();
  // Subscribe to zoom so the panel re-positions when the canvas zoom changes
  // while open. Pan offset is intentionally local state in DashboardView (not
  // in context) to avoid re-render cascades, so pan-while-open is not tracked
  // here — the initial-open case is correctly handled by getBoundingClientRect.
  const { zoom } = useDashboard();

  const transparency = widget.transparency ?? globalStyle.windowTransparency;

  // Clamp panel width so it never overflows narrow viewports
  const effectiveWidth = Math.min(
    PANEL_WIDTH,
    viewport.width - 2 * PANEL_MARGIN
  );

  // Compute panel position using the widget element's actual screen rect via
  // getBoundingClientRect(). This is the only correct approach when the widget
  // canvas has a CSS transform (zoom / pan) applied to it: widget.x/y are world
  // coordinates, not viewport coordinates, so using them directly as `position:
  // fixed` offsets produces a misaligned panel whenever zoom ≠ 1 or pan ≠ 0.
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: PANEL_MARGIN,
    left: PANEL_MARGIN,
  });

  // Pure-ish position calculator. Lists only its real captured deps; the
  // layout effect below adds `viewport` and `zoom` to its own dep list so
  // the recompute fires when the window resizes or the dashboard zooms
  // (both reshape the rect we read off `widgetRef.current` even though the
  // function body doesn't reference those values directly).
  const updatePosition = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelMaxH = vh * 0.8;
    const pw = Math.min(PANEL_WIDTH, vw - 2 * PANEL_MARGIN);

    // Maximized widgets: center the panel
    if (widget.maximized) {
      setPosition({
        top: Math.max(PANEL_MARGIN, (vh - panelMaxH) / 2),
        left: Math.max(PANEL_MARGIN, (vw - pw) / 2),
      });
      return;
    }

    // Use the live screen rect of the widget element, which accounts for any
    // CSS transforms (zoom/pan surface) applied to ancestor elements.
    const rect = widgetRef.current?.getBoundingClientRect();
    const widgetLeft = rect?.left ?? widget.x;
    const widgetTop = rect?.top ?? widget.y;
    const widgetRight = rect != null ? rect.right : widget.x + widget.w;

    // Vertical: align top with widget, clamped to viewport
    const top = Math.max(
      PANEL_MARGIN,
      Math.min(widgetTop, vh - panelMaxH - PANEL_MARGIN)
    );

    // Try right side of widget
    const rightX = widgetRight + PANEL_MARGIN;
    if (rightX + pw + PANEL_MARGIN <= vw) {
      setPosition({ top, left: rightX });
      return;
    }

    // Try left side of widget
    const leftX = widgetLeft - PANEL_MARGIN - pw;
    if (leftX >= PANEL_MARGIN) {
      setPosition({ top, left: leftX });
      return;
    }

    // Fallback: center horizontally
    setPosition({ top, left: Math.max(PANEL_MARGIN, (vw - pw) / 2) });
  }, [widget.x, widget.y, widget.w, widget.maximized, widgetRef]);

  // Recompute on mount and whenever the widget rect or any reactive input
  // that reshapes it (viewport size, dashboard zoom) changes. useLayoutEffect
  // (not useEffect) so the position is applied before paint and the panel
  // never flashes at the wrong spot.
  //
  // Synchronous setState inside a layout effect is the React-recommended
  // pattern for DOM-measurement → render flows (you can't compute the rect
  // in render — the DOM doesn't exist yet on first commit), so the
  // `react-hooks/set-state-in-effect` rule's complaint is a false positive
  // for this case.
  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, viewport, zoom]);

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

  // Close on Escape key — but not when focus is inside a form field.
  // Pressing Escape inside an input/textarea/select should dismiss the field
  // focus (browser default) without also closing the entire panel. onClose is
  // read from onCloseRef (not captured in closure) so this effect never
  // re-subscribes on parent re-renders.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      const isFormField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isFormField) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside to close (exclude widget itself and tool menu).
  // onClose is intentionally NOT in the dep array — it is read from onCloseRef
  // instead (updated on every render above). This prevents the 50ms timer from
  // resetting on every DraggableWindow re-render (drag, zoom, Firestore update),
  // which would silently drop click-outside events arriving within that window.
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        widgetRef.current &&
        !widgetRef.current.contains(target) &&
        !target.closest('[data-settings-exclude]')
      ) {
        onCloseRef.current();
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
  }, [widgetRef]);

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
          <div className="flex items-center gap-2 shrink-0">
            <WidgetBuildingToggle widget={widget} updateWidget={updateWidget} />
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
        </div>

        {/* Tab bar */}
        <div className="flex bg-slate-100 p-1 mx-5 mt-3 mb-1 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-1.5 text-xxs font-black uppercase tracking-widest rounded-lg transition-[color,background-color,box-shadow] ${
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
            className={`flex-1 py-1.5 text-xxs font-black uppercase tracking-widest rounded-lg transition-[color,background-color,box-shadow] ${
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

              {/* Universal Style Settings (only if no custom appearance settings) */}
              {shouldRenderSettings && !appearanceSettings && (
                <UniversalStyleSettings
                  widget={widget}
                  updateWidget={updateWidget}
                />
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
                      className="text-xxs font-black text-brand-blue-primary hover:text-brand-blue-dark uppercase"
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
