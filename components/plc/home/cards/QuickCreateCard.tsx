/**
 * QuickCreateCard — one-click shortcuts to create a quiz assignment,
 * a video activity assignment, or add a shared doc.
 *
 * All three actions route through onNavigate rather than opening modals
 * directly, so this card stays decoupled from the authoring flow (Stream B
 * will wire deeper entry points once it lands).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Film, FileText, Zap, type LucideIcon } from 'lucide-react';
import type { PlcSectionId } from '../../sections';

interface QuickCreateCardProps {
  onNavigate: (id: PlcSectionId) => void;
}

interface QuickAction {
  key: string;
  label: string;
  ariaLabel: string;
  icon: LucideIcon;
  color: string;
  section: PlcSectionId;
}

export const QuickCreateCard: React.FC<QuickCreateCardProps> = ({
  onNavigate,
}) => {
  const { t } = useTranslation();

  const actions: QuickAction[] = [
    {
      key: 'quiz',
      label: t('plcDashboard.home.quickCreate.quiz', {
        defaultValue: 'Create quiz',
      }),
      ariaLabel: t('plcDashboard.home.quickCreate.quiz', {
        defaultValue: 'Create quiz',
      }),
      icon: BookOpen,
      color:
        'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 hover:border-blue-200',
      section: 'assignments',
    },
    {
      key: 'video',
      label: t('plcDashboard.home.quickCreate.video', {
        defaultValue: 'Create video activity',
      }),
      ariaLabel: t('plcDashboard.home.quickCreate.video', {
        defaultValue: 'Create video activity',
      }),
      icon: Film,
      color:
        'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100 hover:border-violet-200',
      section: 'assignments',
    },
    {
      key: 'doc',
      label: t('plcDashboard.home.quickCreate.doc', {
        defaultValue: 'Add a doc',
      }),
      ariaLabel: t('plcDashboard.home.quickCreate.doc', {
        defaultValue: 'Add a doc',
      }),
      icon: FileText,
      color:
        'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100 hover:border-amber-200',
      section: 'docs',
    },
  ];

  return (
    <div className="flex flex-col bg-white/70 backdrop-blur-sm border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div className="w-8 h-8 rounded-xl bg-fuchsia-100 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-fuchsia-600" aria-hidden="true" />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.home.quickCreate.heading', {
            defaultValue: 'Quick create',
          })}
        </h3>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 px-5 pb-5">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            aria-label={action.ariaLabel}
            onClick={() => onNavigate(action.section)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors text-left ${action.color}`}
          >
            <action.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
