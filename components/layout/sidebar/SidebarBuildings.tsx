import React from 'react';
import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';

interface SidebarBuildingsProps {
  isVisible: boolean;
}

export const SidebarBuildings: React.FC<SidebarBuildingsProps> = ({
  isVisible,
}) => {
  const { t } = useTranslation();
  const { selectedBuildings, setSelectedBuildings } = useAuth();
  const BUILDINGS = useAdminBuildings();

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
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-teal-500" />
              </div>
              <h2 className="text-sm font-bold text-slate-800">
                {t('sidebar.settings.myBuildings', {
                  defaultValue: 'My Building(s)',
                })}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              {t('sidebar.settings.myBuildingsDescription', {
                defaultValue:
                  'Select the building(s) you work in. Widgets like Instructional Routines will automatically show content for your grade level. Select multiple if you work across buildings.',
              })}
            </p>
          </div>

          {/* Building List */}
          <div className="flex flex-col gap-2">
            {BUILDINGS.map((building) => {
              const isSelected = selectedBuildings.includes(building.id);
              return (
                <button
                  key={building.id}
                  onClick={() => {
                    const next = isSelected
                      ? selectedBuildings.filter((id) => id !== building.id)
                      : [...selectedBuildings, building.id];
                    void setSelectedBuildings(next);
                  }}
                  type="button"
                  aria-pressed={isSelected}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    isSelected
                      ? 'bg-brand-blue-primary border-brand-blue-primary text-white shadow-md shadow-brand-blue-primary/15'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-brand-blue-light hover:shadow-sm'
                  }`}
                >
                  <span className="text-xs font-bold tracking-tight">
                    {building.name}
                  </span>
                  <span
                    className={`text-xxs font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {building.gradeLabel}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedBuildings.length === 0 && (
            <p className="text-xxs text-slate-400 px-1 italic">
              {t('sidebar.settings.noBuildingSelected', {
                defaultValue: 'No building selected yet.',
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
