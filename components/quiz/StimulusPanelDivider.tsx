// Draggable divider between the sources panel and the question; arrow keys move it, Enter or a double-click resets it.
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  PANEL_PCT_DEFAULT,
  PANEL_PCT_MAX,
  PANEL_PCT_MIN,
  clampPanelPct,
  panelPctForKey,
} from '@/utils/quizStimulusPanel';

export const StimulusPanelDivider: React.FC<{
  pct: number;
  onChange: (pct: number) => void;
  light: boolean;
}> = ({ pct, onChange, light }) => {
  const { t } = useTranslation();
  // A drag moves only the panel's CSS width; the page re-renders once, when the drag ends.
  const drag = React.useRef<number | null>(null);

  const moveTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const row = e.currentTarget.parentElement?.getBoundingClientRect();
    const panel = e.currentTarget.previousElementSibling;
    if (!row || row.width <= 0 || !(panel instanceof HTMLElement)) return;
    const next = clampPanelPct(((e.clientX - row.left) / row.width) * 100);
    drag.current = next;
    panel.style.setProperty('--stimulus-panel-w', `${next}%`);
  };
  const endDrag = () => {
    const final = drag.current;
    drag.current = null;
    if (final !== null && final !== pct) onChange(final);
  };

  return (
    <div
      // no-tour-anchor: student quiz screen; tours walk teachers
      role="separator"
      aria-orientation="vertical"
      aria-label={t('quizStimulusTabs.resize', 'Resize the sources panel')}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={PANEL_PCT_MIN}
      aria-valuemax={PANEL_PCT_MAX}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = pct;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current === null) return;
        if (e.buttons === 0) endDrag();
        else moveTo(e);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => onChange(PANEL_PCT_DEFAULT)}
      onKeyDown={(e) => {
        const next = panelPctForKey(e.key, pct);
        if (next === null) return;
        e.preventDefault();
        onChange(next);
      }}
      className="group hidden lg:flex sticky top-0 h-screen w-4 shrink-0 items-center justify-center cursor-col-resize touch-none select-none touch-target-expand [-webkit-tap-highlight-color:transparent] focus-visible:outline-hidden"
    >
      <span
        aria-hidden
        className={`h-full w-px transition-colors group-hover:bg-brand-blue-primary group-focus-visible:bg-brand-blue-primary ${light ? 'bg-slate-300' : 'bg-slate-600'}`}
      />
      <span
        aria-hidden
        className={`absolute h-14 w-1.5 rounded-full transition-colors group-hover:bg-brand-blue-primary group-focus-visible:bg-brand-blue-primary group-focus-visible:ring-2 group-focus-visible:ring-brand-blue-primary/40 ${light ? 'bg-slate-400' : 'bg-slate-500'}`}
      />
    </div>
  );
};
