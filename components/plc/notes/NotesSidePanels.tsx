import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, PanelRightClose, StickyNote } from 'lucide-react';
import {
  ACTION_PANEL_MAX,
  ACTION_PANEL_MIN,
} from '@/hooks/usePlcActionPanelWidth';

interface PanelResizerProps {
  width: number;
  onResize: (width: number) => void;
}

/** Drag handle on the Action items panel's left edge; dragging left widens it. */
export const PanelResizer: React.FC<PanelResizerProps> = ({
  width,
  onResize,
}) => {
  const { t } = useTranslation();
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={ACTION_PANEL_MIN}
      aria-valuemax={ACTION_PANEL_MAX}
      aria-valuenow={width}
      aria-label={t('plcDashboard.notes.sidePanels.resize', {
        defaultValue: 'Resize action items',
      })}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onResize(start.current.width + (start.current.x - e.clientX));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onResize(width + 24);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onResize(width - 24);
        }
      }}
      className="group relative w-3 shrink-0 cursor-col-resize touch-none focus:outline-none"
    >
      <span className="absolute inset-y-6 left-1/2 w-px -translate-x-1/2 bg-slate-200 transition-colors group-hover:bg-brand-blue-primary group-focus-visible:bg-brand-blue-primary" />
    </div>
  );
};

interface RailProps {
  side: 'left' | 'right';
  onOpen: () => void;
  count?: number;
}

/** The folded panel: a narrow strip that reopens it. */
export const PanelRail: React.FC<RailProps> = ({ side, onOpen, count }) => {
  const { t } = useTranslation();
  const label =
    side === 'left'
      ? t('plcDashboard.notes.heading', { defaultValue: 'Notes' })
      : t('plcDashboard.notes.actionItems.title', {
          defaultValue: 'Action items',
        });
  const Icon = side === 'left' ? StickyNote : ListChecks;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      className={`${side === 'left' ? 'w-16' : 'w-12'} h-full shrink-0 flex flex-col items-center gap-2 pt-3 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-brand-blue-primary hover:bg-slate-50 transition-colors`}
    >
      {side === 'left' && (
        <span className="text-xxs font-bold uppercase tracking-widest">
          {label}
        </span>
      )}
      <Icon className="w-5 h-5" aria-hidden />
      {count != null && count > 0 && (
        <span className="text-xs font-bold text-slate-700">{count}</span>
      )}
    </button>
  );
};

interface ActionItemsPanelProps {
  width: number;
  onClose: () => void;
  children: React.ReactNode;
}

export const ActionItemsPanel: React.FC<ActionItemsPanelProps> = ({
  width,
  onClose,
  children,
}) => {
  const { t } = useTranslation();
  const title = t('plcDashboard.notes.actionItems.title', {
    defaultValue: 'Action items',
  });
  return (
    <aside
      style={{ width }}
      className="shrink-0 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden"
    >
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-100">
        <h3 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('plcDashboard.notes.sidePanels.showNotes', {
            defaultValue: 'Show notes list',
          })}
          title={t('plcDashboard.notes.sidePanels.showNotes', {
            defaultValue: 'Show notes list',
          })}
          className="p-1 text-slate-400 hover:text-brand-blue-primary hover:bg-slate-100 rounded-md transition-colors"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </aside>
  );
};
