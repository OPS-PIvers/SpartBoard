import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, CheckSquare } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { TOOLS } from '@/config/tools';
import { getWidgetGradeLevels } from '@/config/widgetGradeLevels';

interface SidebarWidgetsProps {
  isVisible: boolean;
}

export const SidebarWidgets: React.FC<SidebarWidgetsProps> = ({
  isVisible,
}) => {
  const { t } = useTranslation();
  const {
    visibleTools,
    toggleToolVisibility,
    setAllToolsVisibility,
    gradeFilter,
    setGradeFilter,
  } = useDashboard();
  const { featurePermissions } = useAuth();

  // Grade filter options for consistent validation and rendering
  const GRADE_FILTER_OPTIONS = [
    { value: 'all', label: t('sidebar.widgets.all') },
    { value: 'k-2', label: 'K-2' },
    { value: '3-5', label: '3-5' },
    { value: '6-8', label: '6-8' },
    { value: '9-12', label: '9-12' },
  ] as const;

  // Memoize filtered tools to prevent unnecessary recalculations
  const filteredTools = useMemo(() => {
    return TOOLS.filter((tool) => {
      if (gradeFilter === 'all') return true;

      // Check for override in feature permissions
      const permission = featurePermissions.find(
        (p) => p.widgetType === tool.type
      );
      const levels = permission?.gradeLevels ?? getWidgetGradeLevels(tool.type);

      return levels.includes(gradeFilter);
    });
  }, [gradeFilter, featurePermissions]);

  return (
    <div
      className={`absolute inset-0 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      {/* Grade Level Filter */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xxs font-bold uppercase tracking-widest text-slate-400">
            {t('sidebar.widgets.gradeFilter')}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {GRADE_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setGradeFilter(option.value)}
              className={`py-1.5 rounded-md text-xxs font-bold uppercase transition-all ${
                gradeFilter === option.value
                  ? 'bg-brand-blue-primary text-white shadow-sm'
                  : 'bg-white text-slate-500 hover:bg-slate-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
          {t('sidebar.widgets.availableWidgets')}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setAllToolsVisibility(true)}
            className="text-xxs font-bold text-brand-blue-primary uppercase"
          >
            {t('sidebar.widgets.all')}
          </button>
          <button
            onClick={() => setAllToolsVisibility(false)}
            className="text-xxs font-bold text-slate-400 uppercase"
          >
            {t('sidebar.widgets.none')}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {filteredTools.map((tool) => {
          const permission = featurePermissions.find(
            (p) => p.widgetType === tool.type
          );
          const gradeLevels =
            permission?.gradeLevels ?? getWidgetGradeLevels(tool.type);
          const isActive = visibleTools.includes(tool.type);
          const displayLabel = permission?.displayName?.trim() ?? tool.label;

          return (
            <button
              key={tool.type}
              onClick={() => toggleToolVisibility(tool.type)}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all border ${
                isActive
                  ? 'bg-white border-brand-blue-primary text-slate-900 shadow-sm'
                  : 'bg-white border-slate-100 text-slate-500 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-1.5 rounded-md ${isActive ? tool.color : 'bg-slate-100'} text-white`}
                >
                  <tool.icon className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xxs font-bold uppercase tracking-tight">
                    {displayLabel}
                  </div>
                  <div className="flex gap-1 mt-0.5">
                    {gradeLevels.map((level) => (
                      <span
                        key={level}
                        className="text-xxxs font-bold px-1 py-0.5 rounded bg-slate-50 text-slate-400 uppercase"
                      >
                        {level}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {isActive && (
                <CheckSquare className="w-4 h-4 text-brand-blue-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
