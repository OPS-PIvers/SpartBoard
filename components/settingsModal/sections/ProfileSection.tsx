/**
 * ProfileSection — who the teacher is: building(s), grades taught, content
 * areas taught. Grades default from the buildings and drive grade-gated
 * widgets plus the standards picker; subjects only filter standards/targets.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, GraduationCap, Library, UserCircle } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useSubjects } from '@/hooks/useSubjects';
import { ALL_GRADES } from '@/utils/gradeMatch';
import { SettingsSectionHeader } from '@/components/settingsModal/SettingsSectionHeader';

const chipClass = (selected: boolean) =>
  `min-w-[2.5rem] px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
    selected
      ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
      : 'bg-white border-slate-200 text-slate-600 hover:border-brand-blue-light'
  }`;

const GroupHeading: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex items-start gap-2.5">
    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-slate-700">{title}</h3>
        {action}
      </div>
      <p className="text-xxs text-slate-500 mt-0.5 leading-relaxed">
        {description}
      </p>
    </div>
  </div>
);

export const ProfileSection: React.FC = () => {
  const { t } = useTranslation();
  const {
    selectedBuildings,
    setSelectedBuildings,
    gradesTaught,
    effectiveGrades,
    subjectsTaught,
    updateTeachingProfile,
  } = useAuth();
  const buildings = useAdminBuildings();
  const { active: subjects } = useSubjects();

  const toggleBuilding = (id: string) => {
    const next = selectedBuildings.includes(id)
      ? selectedBuildings.filter((b) => b !== id)
      : [...selectedBuildings, id];
    void setSelectedBuildings(next);
  };

  const toggleGrade = (grade: string) => {
    const next = effectiveGrades.includes(grade)
      ? effectiveGrades.filter((g) => g !== grade)
      : [...effectiveGrades, grade];
    void updateTeachingProfile({ gradesTaught: next });
  };

  const toggleSubject = (id: string) => {
    const next = subjectsTaught.includes(id)
      ? subjectsTaught.filter((s) => s !== id)
      : [...subjectsTaught, id];
    void updateTeachingProfile({ subjectsTaught: next });
  };

  return (
    <div className="p-5 space-y-6">
      <SettingsSectionHeader
        icon={<UserCircle className="w-4 h-4" />}
        title={t('settings.profile.title', { defaultValue: 'Profile' })}
        description={t('settings.profile.description', {
          defaultValue:
            'Where and what you teach. Grades and content areas filter standards and learning targets so you only see what applies to you.',
        })}
        scopeLabel={t('settings.scopeAllBoards', {
          defaultValue: 'All boards',
        })}
      />

      <section className="space-y-3">
        <GroupHeading
          icon={<Building2 className="w-4 h-4" />}
          title={t('sidebar.settings.myBuildings', {
            defaultValue: 'My Building(s)',
          })}
          description={t('sidebar.settings.myBuildingsDescription', {
            defaultValue:
              'Select the building(s) you work in. Widgets like Instructional Routines will automatically show content for your grade level. Select multiple if you work across buildings.',
          })}
        />
        <div className="flex flex-col gap-2">
          {buildings.map((building) => {
            const isSelected = selectedBuildings.includes(building.id);
            return (
              <button
                key={building.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleBuilding(building.id)}
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
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {building.gradeLabel}
                </span>
              </button>
            );
          })}
        </div>
        {selectedBuildings.length === 0 && (
          <p className="text-xxs text-slate-500 px-1 italic">
            {t('sidebar.settings.noBuildingSelected', {
              defaultValue: 'No building selected yet.',
            })}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <GroupHeading
          icon={<GraduationCap className="w-4 h-4" />}
          title={t('settings.profile.gradesTaught', {
            defaultValue: 'Grades taught',
          })}
          description={t('settings.profile.gradesTaughtDescription', {
            defaultValue:
              'Starts from your building(s). Deselect grades you do not teach to narrow standards, learning targets and grade-specific widgets.',
          })}
          action={
            gradesTaught !== null && (
              <button
                type="button"
                onClick={() =>
                  void updateTeachingProfile({ gradesTaught: null })
                }
                className="text-xxs font-bold text-brand-blue-primary hover:underline whitespace-nowrap"
              >
                {t('settings.profile.resetGrades', {
                  defaultValue: 'Reset to building default',
                })}
              </button>
            )
          }
        />
        <div
          role="group"
          aria-label={t('settings.profile.gradesTaught', {
            defaultValue: 'Grades taught',
          })}
          className="flex flex-wrap gap-1.5"
        >
          {ALL_GRADES.map((grade) => {
            const selected = effectiveGrades.includes(grade);
            return (
              <button
                key={grade}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleGrade(grade)}
                className={chipClass(selected)}
              >
                {grade}
              </button>
            );
          })}
        </div>
        {effectiveGrades.length === 0 && (
          <p className="text-xxs text-slate-500 px-1 italic">
            {t('settings.profile.noGrades', {
              defaultValue:
                'No grades selected — standards and widgets show every grade.',
            })}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <GroupHeading
          icon={<Library className="w-4 h-4" />}
          title={t('settings.profile.subjectsTaught', {
            defaultValue: 'Content areas taught',
          })}
          description={t('settings.profile.subjectsTaughtDescription', {
            defaultValue:
              'Optional. Pick the content areas you teach to open the standards picker on them. Leave empty to see every content area.',
          })}
        />
        <div
          role="group"
          aria-label={t('settings.profile.subjectsTaught', {
            defaultValue: 'Content areas taught',
          })}
          className="flex flex-wrap gap-1.5"
        >
          {subjects.map((subject) => {
            const selected = subjectsTaught.includes(subject.id);
            return (
              <button
                key={subject.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleSubject(subject.id)}
                className={chipClass(selected)}
              >
                {subject.label}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
