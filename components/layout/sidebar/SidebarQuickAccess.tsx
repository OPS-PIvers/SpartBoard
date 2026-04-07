import React from 'react';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { TOOLS } from '@/config/tools';

interface SidebarQuickAccessProps {
  isVisible: boolean;
}

export const SidebarQuickAccess: React.FC<SidebarQuickAccessProps> = ({
  isVisible,
}) => {
  const { t } = useTranslation();
  const { activeDashboard, updateDashboardSettings } = useDashboard();

  const quickAccessWidgets =
    activeDashboard?.settings?.quickAccessWidgets ?? [];
  const maxSlots = 2;

  return (
    <div
      className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-5 space-y-5">
          {/* Page Header */}
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <h2 className="text-sm font-bold text-slate-800">
                {t('sidebar.settings.quickAccessWidgets', {
                  defaultValue: 'Quick Access',
                })}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              {t('sidebar.settings.quickAccessDescription', {
                defaultValue:
                  'Pin up to 2 widgets to the toolbar for one-tap access. Selected widgets appear as shortcuts next to the menu button.',
              })}
            </p>
          </div>

          {/* Selection Counter */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xxs font-bold text-slate-500 uppercase tracking-wider">
              {t('sidebar.settings.slotsUsed', {
                defaultValue: 'Slots used',
              })}
            </span>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: maxSlots }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i < quickAccessWidgets.length
                      ? 'bg-brand-blue-primary scale-110'
                      : 'bg-slate-200'
                  }`}
                />
              ))}
              <span className="text-xxs font-bold text-slate-600 ml-1.5">
                {quickAccessWidgets.length}/{maxSlots}
              </span>
            </div>
          </div>

          {/* Widget Grid */}
          <div className="grid grid-cols-5 gap-2.5">
            {TOOLS.map((tool) => {
              const isSelected = quickAccessWidgets.includes(tool.type);
              const isFull = quickAccessWidgets.length >= maxSlots;
              const disabled = !isSelected && isFull;

              return (
                <div key={tool.type} className="group relative">
                  <button
                    onClick={() => {
                      const current = quickAccessWidgets;
                      let next;
                      if (current.includes(tool.type)) {
                        next = current.filter((t) => t !== tool.type);
                      } else if (current.length < maxSlots) {
                        next = [...current, tool.type];
                      } else {
                        return;
                      }
                      updateDashboardSettings({ quickAccessWidgets: next });
                    }}
                    disabled={disabled}
                    aria-label={tool.label}
                    className={`w-full aspect-square flex flex-col items-center justify-center rounded-xl transition-all ${
                      isSelected
                        ? 'bg-brand-blue-primary text-white shadow-md ring-2 ring-brand-blue-primary/20 scale-105'
                        : disabled
                          ? 'bg-slate-50 text-slate-200 cursor-not-allowed border border-slate-100'
                          : 'bg-white text-slate-400 border border-slate-200 hover:border-brand-blue-light hover:text-brand-blue-primary hover:shadow-sm'
                    }`}
                  >
                    <tool.icon className="w-5 h-5" />
                  </button>
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-800 text-white text-xxxs font-bold uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-modal shadow-lg scale-95 group-hover:scale-100">
                    {tool.label}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
