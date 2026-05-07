import React from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, Sparkles, StickyNote } from 'lucide-react';
import type { PlcDashboardTabId } from '../../PlcDashboard';

interface QuickActionsTileProps {
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

export const QuickActionsTile: React.FC<QuickActionsTileProps> = ({
  onNavigateTab,
}) => {
  const { t } = useTranslation();

  const actions: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    onClick: () => void;
  }> = [
    {
      label: t('plcDashboard.overview.tiles.quickActions.addNote', {
        defaultValue: 'Add note',
      }),
      icon: StickyNote,
      color: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
      onClick: () => onNavigateTab('notes'),
    },
    {
      label: t('plcDashboard.overview.tiles.quickActions.addTodo', {
        defaultValue: 'Add to-do',
      }),
      icon: ListChecks,
      color: 'bg-violet-50 text-violet-700 hover:bg-violet-100',
      onClick: () => onNavigateTab('todos'),
    },
  ];

  return (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-fuchsia-100 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-fuchsia-600" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.quickActions.heading', {
            defaultValue: 'Quick actions',
          })}
        </h4>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left ${action.color}`}
          >
            <action.icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
