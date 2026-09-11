// Unified Assessments section: a left rail of assessment types over the active body.

import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ClipboardCheck, Film, type LucideIcon } from 'lucide-react';
import { Plc, getPlcFeatures } from '@/types';
import { PlcAssessmentList } from '@/components/plc/assessments/PlcAssessmentList';
import { PlcAssessmentDetail } from '@/components/plc/assessments/PlcAssessmentDetail';
import { PlcVideoActivitiesTabsBody } from './PlcVideoActivitiesTabsBody';
import { PlcRubricLibraryBody } from './PlcRubricLibraryBody';

type AssessmentType = 'quiz' | 'video-activity' | 'rubric';

interface TypeNavDef {
  id: AssessmentType;
  icon: LucideIcon;
  labelKey: string;
  labelDefault: string;
}

const TYPE_NAV: readonly TypeNavDef[] = [
  {
    id: 'quiz',
    icon: BookOpen,
    labelKey: 'plcDashboard.assessmentsTypes.quizzes',
    labelDefault: 'Quizzes',
  },
  {
    id: 'video-activity',
    icon: Film,
    labelKey: 'plcDashboard.assessmentsTypes.videoActivities',
    labelDefault: 'Video Activities',
  },
  {
    id: 'rubric',
    icon: ClipboardCheck,
    labelKey: 'plcDashboard.assessmentsTypes.rubrics',
    labelDefault: 'Rubrics',
  },
] as const;

interface PlcAssessmentsBodyProps {
  plc: Plc;
  /** Pooled-results detail id from `/plc/:id/assessments/:assessmentId`. */
  assessmentId?: string | null;
  /** Closes the PLC dashboard so the post-assign hand-off can open the widget. */
  onCloseDashboard: () => void;
}

export const PlcAssessmentsBody: React.FC<PlcAssessmentsBodyProps> = ({
  plc,
  assessmentId = null,
  onCloseDashboard,
}) => {
  const { t } = useTranslation();
  const features = useMemo(() => getPlcFeatures(plc), [plc]);

  // Rubrics have no feature flag — they ride along with the section.
  const enabledTypes = useMemo(
    () =>
      TYPE_NAV.filter((f) => {
        if (f.id === 'quiz') return features.quizzes;
        if (f.id === 'video-activity') return features.videoActivities;
        return true;
      }),
    [features.quizzes, features.videoActivities]
  );

  const [activeType, setActiveType] = useState<AssessmentType>(
    () => enabledTypes[0]?.id ?? 'quiz'
  );

  // Adjust during render if the active type's feature was just turned off.
  const effectiveType: AssessmentType = enabledTypes.some(
    (f) => f.id === activeType
  )
    ? activeType
    : (enabledTypes[0]?.id ?? 'quiz');

  const tabIdBase = useId();
  const tabButtonId = (id: AssessmentType) => `${tabIdBase}-type-${id}`;
  const panelId = `${tabIdBase}-panel`;

  const showNav = enabledTypes.length > 1;

  if (assessmentId) {
    return <PlcAssessmentDetail plc={plc} assessmentId={assessmentId} />;
  }

  const typeNav = showNav ? (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label={t('plcDashboard.assessmentsTypes.label', {
        defaultValue: 'Assessment type',
      })}
      className="flex flex-col gap-0.5 pb-3 border-b border-slate-200"
    >
      {enabledTypes.map((item) => {
        const isActive = effectiveType === item.id;
        return (
          <button
            key={item.id}
            role="tab"
            id={tabButtonId(item.id)}
            aria-selected={isActive}
            aria-controls={panelId}
            type="button"
            onClick={() => setActiveType(item.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
              isActive
                ? 'bg-brand-blue-primary text-white font-semibold shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t(item.labelKey, { defaultValue: item.labelDefault })}
            </span>
          </button>
        );
      })}
    </div>
  ) : null;

  const panelProps = {
    role: 'tabpanel',
    id: panelId,
    'aria-labelledby': showNav ? tabButtonId(effectiveType) : undefined,
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {effectiveType === 'quiz' ? (
        <div {...panelProps} className="flex-1 min-h-0">
          <PlcAssessmentList
            plc={plc}
            onCloseDashboard={onCloseDashboard}
            rail={typeNav}
          />
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 h-full min-h-0">
          {typeNav && (
            <div className="w-full md:w-56 md:shrink-0">{typeNav}</div>
          )}
          <div {...panelProps} className="flex-1 min-w-0 min-h-0">
            {effectiveType === 'video-activity' && (
              <PlcVideoActivitiesTabsBody plc={plc} />
            )}
            {effectiveType === 'rubric' && <PlcRubricLibraryBody plc={plc} />}
          </div>
        </div>
      )}
    </div>
  );
};
