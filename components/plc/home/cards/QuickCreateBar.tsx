/**
 * QuickCreateBar — a horizontal row of quick-create action buttons shown
 * at the top of the PLC Home page (create a quiz assignment, a video
 * activity assignment, or add a shared doc).
 *
 * All three actions route through onNavigate rather than opening modals
 * directly, so this bar stays decoupled from the authoring flow.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Film, FileText, type LucideIcon } from 'lucide-react';
import type { PlcSectionId } from '@/components/plc/sections';

interface QuickCreateBarProps {
  onNavigate: (id: PlcSectionId) => void;
}

interface QuickAction {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  section: PlcSectionId;
}

export const QuickCreateBar: React.FC<QuickCreateBarProps> = ({
  onNavigate,
}) => {
  const { t } = useTranslation();

  const actions: QuickAction[] = [
    {
      key: 'quiz',
      label: t('plcDashboard.home.quickCreate.quiz', {
        defaultValue: 'Create quiz',
      }),
      icon: BookOpen,
      color:
        'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 hover:border-blue-200',
      section: 'quizzes',
    },
    {
      key: 'video',
      label: t('plcDashboard.home.quickCreate.video', {
        defaultValue: 'Create video activity',
      }),
      icon: Film,
      color:
        'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100 hover:border-violet-200',
      section: 'videoActivities',
    },
    {
      key: 'doc',
      label: t('plcDashboard.home.quickCreate.doc', {
        defaultValue: 'Add a doc',
      }),
      icon: FileText,
      color:
        'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100 hover:border-amber-200',
      section: 'docs',
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          aria-label={action.label}
          onClick={() => onNavigate(action.section)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${action.color}`}
        >
          <action.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
};
