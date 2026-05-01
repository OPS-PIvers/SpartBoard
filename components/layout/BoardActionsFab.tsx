import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useClickOutside } from '@/hooks/useClickOutside';
import { FAB_BASE } from './fabClasses';
import {
  ZOOM_DEFAULT,
  clampZoom,
  sliderToZoom,
  zoomToSlider,
} from '@/utils/zoomMapping';

interface BoardActionsFabProps {
  onOpenCheatSheet: () => void;
}

const PRESETS: { value: number; labelKey: string; defaultLabel: string }[] = [
  { value: 0.5, labelKey: 'boardZoom.preset50', defaultLabel: '50%' },
  { value: 1, labelKey: 'boardZoom.preset100', defaultLabel: '100%' },
  { value: 2, labelKey: 'boardZoom.preset200', defaultLabel: '200%' },
  { value: 5, labelKey: 'boardZoom.preset500', defaultLabel: '500%' },
];

export const BoardActionsFab: FC<BoardActionsFabProps> = ({
  onOpenCheatSheet,
}) => {
  const { t } = useTranslation();
  const { zoom, setZoom } = useDashboard();
  const { dockPosition } = useAuth();

  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const headerId = useId();

  const closeSlider = useCallback((returnFocus = true) => {
    setIsSliderOpen(false);
    if (returnFocus) zoomTriggerRef.current?.focus();
  }, []);

  const handleClickOutside = useCallback(() => {
    setIsSliderOpen(false);
  }, []);

  useClickOutside(containerRef, handleClickOutside);

  // When the popup opens, drop focus into the slider so keyboard users land
  // on the primary control immediately.
  useEffect(() => {
    if (!isSliderOpen) return;
    const slider = popupRef.current?.querySelector<HTMLInputElement>(
      'input[type="range"]'
    );
    slider?.focus();
  }, [isSliderOpen]);

  const isZoomed = zoom !== ZOOM_DEFAULT;
  const percentage = Math.round(zoom * 100);

  // Mirror BoardNavFab's left/right anchoring: when the dock occupies the
  // right edge, the cluster must move to the left so they don't overlap.
  const onLeftSide = dockPosition === 'right';
  const positionClass = onLeftSide ? 'left-14' : 'right-4';
  // The popup card itself anchors to the same edge as the cluster.
  const popupEdge = onLeftSide ? 'left-0' : 'right-0';
  // The reset FAB animates in from whichever direction the cluster grows.
  const resetSlideClass = onLeftSide
    ? 'slide-in-from-left-2'
    : 'slide-in-from-right-2';

  const handleSliderChange = (rawValue: number) => {
    setZoom(sliderToZoom(rawValue));
  };

  const handleReset = () => {
    setZoom(ZOOM_DEFAULT);
  };

  const handlePresetClick = (value: number) => {
    setZoom(clampZoom(value));
  };

  const handlePopupKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSlider();
      return;
    }
    if (e.key === 'Tab') {
      // Tab takes focus out of the popup — close it so the open state stays
      // consistent with where focus actually is (mirrors BoardNavFab's menu).
      // Don't return focus to the trigger; let Tab proceed naturally.
      closeSlider(false);
    }
  };

  const ZoomIcon = isZoomed ? (zoom > 1 ? ZoomIn : ZoomOut) : Search;

  return (
    <div
      ref={containerRef}
      data-screenshot="exclude"
      className={`fixed bottom-6 ${positionClass} z-dock`}
    >
      {isSliderOpen && (
        <div
          ref={popupRef}
          role="dialog"
          aria-labelledby={headerId}
          onKeyDown={handlePopupKeyDown}
          className={`absolute bottom-full ${popupEdge} mb-2 w-64 rounded-2xl border border-white/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl px-3.5 py-3 animate-in fade-in slide-in-from-bottom-2 duration-150`}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              id={headerId}
              className="text-xxs font-bold uppercase tracking-wider text-white/40"
            >
              {t('boardZoom.zoomLevel', { defaultValue: 'Zoom' })}
            </span>
            <span className="text-xs font-black text-white tabular-nums">
              {percentage}%
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={zoomToSlider(zoom)}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            aria-label={t('boardZoom.slider', { defaultValue: 'Zoom level' })}
            // The native input drives valuemin/valuemax/valuenow from
            // min/max/value automatically — the underlying range is 0–100
            // (raw slider units), and aria-valuetext conveys the meaningful
            // zoom percentage to assistive tech without conflicting with
            // the implicit range.
            aria-valuetext={`${percentage}%`}
            className="w-full accent-brand-blue-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary rounded"
          />

          <div className="grid grid-cols-4 gap-1 mt-2">
            {PRESETS.map(({ value, labelKey, defaultLabel }) => {
              const active = Math.abs(zoom - value) < 0.01;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handlePresetClick(value)}
                  className={`text-xxs font-bold py-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
                    active
                      ? 'bg-brand-blue-primary text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {t(labelKey, { defaultValue: defaultLabel })}
                </button>
              );
            })}
          </div>

          {isZoomed && (
            <>
              <div className="h-px bg-white/10 my-2" />
              <button
                type="button"
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-white/60 hover:text-white/90 py-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('boardZoom.reset', { defaultValue: 'Reset to 100%' })}
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-1">
        {isZoomed && (
          <button
            type="button"
            onClick={handleReset}
            aria-label={t('boardZoom.reset', { defaultValue: 'Reset to 100%' })}
            title={t('boardZoom.reset', { defaultValue: 'Reset to 100%' })}
            className={`${FAB_BASE} animate-in fade-in ${resetSlideClass} duration-200`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        <button
          ref={zoomTriggerRef}
          type="button"
          onClick={() => setIsSliderOpen((v) => !v)}
          aria-label={t('boardZoom.slider', { defaultValue: 'Zoom level' })}
          aria-haspopup="dialog"
          aria-expanded={isSliderOpen}
          title={`${t('boardZoom.slider', { defaultValue: 'Zoom level' })} (Ctrl + scroll)`}
          className={FAB_BASE}
        >
          <ZoomIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onOpenCheatSheet}
          aria-label={t('widgets.cheatSheet.title')}
          title={`${t('widgets.cheatSheet.title')} (Ctrl+/)`}
          className={FAB_BASE}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
