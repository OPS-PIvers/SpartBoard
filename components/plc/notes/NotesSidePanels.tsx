import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ListChecks,
  PanelLeftOpen,
  PanelRightClose,
  type LucideIcon,
} from 'lucide-react';
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
      className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none focus:outline-none"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-200 transition-colors group-hover:w-0.5 group-hover:bg-brand-blue-primary group-focus-visible:w-0.5 group-focus-visible:bg-brand-blue-primary" />
    </div>
  );
};

export interface NotesRailEntry {
  key: string;
  title: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
}

interface NotesRailProps {
  entries: NotesRailEntry[];
  onOpen: () => void;
}

/** The folded notes list: one button per note or doc, under the button that reopens the list. */
export const NotesRail: React.FC<NotesRailProps> = ({ entries, onOpen }) => {
  const { t } = useTranslation();
  const showList = t('plcDashboard.notes.sidePanels.showNotes', {
    defaultValue: 'Show notes list',
  });
  return (
    <nav
      aria-label={t('plcDashboard.notes.heading', { defaultValue: 'Notes' })}
      className="w-28 shrink-0 flex flex-col border-r border-slate-200"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={showList}
        title={showList}
        className="shrink-0 h-14 flex items-center justify-center border-b border-slate-200 text-slate-400 hover:text-brand-blue-primary hover:bg-slate-50 transition-colors"
      >
        <PanelLeftOpen className="w-4 h-4" />
      </button>
      <ul className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
        {entries.map(({ key, title, icon: Icon, active, onSelect }) => (
          <li key={key}>
            <button
              type="button"
              onClick={onSelect}
              aria-current={active ? 'true' : undefined}
              title={title}
              className={`w-full flex flex-col items-center gap-1.5 px-2 py-3 border-b border-slate-100 transition-colors ${
                active
                  ? 'bg-brand-blue-lighter/50 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? 'text-brand-blue-primary' : 'text-slate-400'
                }`}
                aria-hidden
              />
              <span className="w-full text-center text-xxs font-bold leading-snug line-clamp-2 break-words">
                {title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

interface ActionItemsRailProps {
  onOpen: () => void;
  count: number;
}

/** The folded Action items panel: reopens it and shows how many are open. */
export const ActionItemsRail: React.FC<ActionItemsRailProps> = ({
  onOpen,
  count,
}) => {
  const { t } = useTranslation();
  const label = t('plcDashboard.notes.sidePanels.showActionItems', {
    defaultValue: 'Show action items',
  });
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      className="w-12 shrink-0 flex flex-col items-center gap-1.5 pt-3.5 border-l border-slate-200 bg-slate-50 text-slate-500 hover:text-brand-blue-primary hover:bg-white transition-colors"
    >
      <ListChecks className="w-4 h-4" aria-hidden />
      {count > 0 && (
        <span className="text-xs font-bold text-slate-700">{count}</span>
      )}
    </button>
  );
};

interface ActionItemsPanelProps {
  width: number;
  onClose: () => void;
  heading?: React.ReactNode;
  children: React.ReactNode;
}

export const ActionItemsPanel: React.FC<ActionItemsPanelProps> = ({
  width,
  onClose,
  heading,
  children,
}) => {
  const { t } = useTranslation();
  const showList = t('plcDashboard.notes.sidePanels.showNotes', {
    defaultValue: 'Show notes list',
  });
  return (
    <aside style={{ width }} className="shrink-0 flex flex-col overflow-hidden">
      <div className="shrink-0 h-14 flex items-center justify-between gap-2 px-3 border-b border-slate-200">
        {heading ?? (
          <h3 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
            {t('plcDashboard.notes.actionItems.title', {
              defaultValue: 'Action items',
            })}
          </h3>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={showList}
          title={showList}
          className="p-1 text-slate-400 hover:text-brand-blue-primary hover:bg-slate-100 rounded-md transition-colors"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </aside>
  );
};
