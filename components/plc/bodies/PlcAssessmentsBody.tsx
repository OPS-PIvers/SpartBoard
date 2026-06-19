/**
 * PlcAssessmentsBody — Wave-4 unified Assessments section (Decision 4.5, §6.1).
 *
 * The pre-Wave-4 rail had two separate sections, Quizzes and Video Activities.
 * This body merges them into ONE Assessments section with a quiz /
 * video-activity TYPE FILTER at the top, matching the Common Assessment
 * abstraction. It deliberately PRESERVES the existing section internals — the
 * quiz view is the unchanged `PlcQuizzesBody` (its Library / In-progress /
 * Completed sub-tabs + assign wizard) and the video-activity view is the
 * unchanged `PlcVideoActivitiesTabsBody`. Nothing inside those bodies is
 * rebuilt; this component only chooses which one to mount.
 *
 * Feature gating: the section itself is only in the rail when EITHER the quiz
 * OR the video-activity feature is on (see `sections.ts`). Within the section
 * the type filter only offers the enabled halves — if a team turns off just
 * video activities, the filter collapses to quiz-only (and vice-versa) and the
 * single remaining body renders directly with no redundant toggle.
 */

import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Film, type LucideIcon } from 'lucide-react';
import { Plc, getPlcFeatures } from '@/types';
import { PlcQuizzesBody } from './PlcQuizzesBody';
import { PlcVideoActivitiesTabsBody } from './PlcVideoActivitiesTabsBody';

type AssessmentType = 'quiz' | 'video-activity';

interface TypeFilterDef {
  id: AssessmentType;
  icon: LucideIcon;
  labelKey: string;
  labelDefault: string;
}

const TYPE_FILTERS: readonly TypeFilterDef[] = [
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
] as const;

interface PlcAssessmentsBodyProps {
  plc: Plc;
  /**
   * Closes the entire PLC dashboard. Forwarded to the quiz body so its post-
   * assign "Edit all settings…" hand-off from the class-period picker can
   * dismiss the dashboard before the QuizWidget opens the full assignment
   * editor.
   */
  onCloseDashboard: () => void;
}

export const PlcAssessmentsBody: React.FC<PlcAssessmentsBodyProps> = ({
  plc,
  onCloseDashboard,
}) => {
  const { t } = useTranslation();
  const features = useMemo(() => getPlcFeatures(plc), [plc]);

  // Only offer the type filters whose underlying feature is enabled. The
  // section can only mount when at least one is on (rail gating in
  // sections.ts), so `enabledTypes` is always non-empty here.
  const enabledTypes = useMemo(
    () =>
      TYPE_FILTERS.filter((f) =>
        f.id === 'quiz' ? features.quizzes : features.videoActivities
      ),
    [features.quizzes, features.videoActivities]
  );

  // Default to the first enabled type (quiz when both are on).
  const [activeType, setActiveType] = useState<AssessmentType>(
    () => enabledTypes[0]?.id ?? 'quiz'
  );

  // If the active type's feature was toggled off while the section is open,
  // fall back to a still-enabled type. Computed during render (no effect) per
  // the "adjusting state while rendering" pattern.
  const effectiveType: AssessmentType = enabledTypes.some(
    (f) => f.id === activeType
  )
    ? activeType
    : (enabledTypes[0]?.id ?? 'quiz');

  // Stable ids so each tabpanel can point back at its tab (WCAG AA tablist).
  const tabIdBase = useId();
  const tabButtonId = (id: AssessmentType) => `${tabIdBase}-type-${id}`;
  const panelId = `${tabIdBase}-panel`;

  const showFilter = enabledTypes.length > 1;

  // No outer padding: the hosted bodies (`PlcQuizzesBody` /
  // `PlcVideoActivitiesTabsBody`) own their own spacing exactly as they did
  // when each was its own section, so the merge is visually transparent.
  return (
    <div className="flex flex-col gap-4 h-full">
      {showFilter && (
        <div
          role="tablist"
          aria-label={t('plcDashboard.assessmentsTypes.label', {
            defaultValue: 'Assessment type',
          })}
          className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl self-start"
        >
          {enabledTypes.map((filter) => {
            const isActive = effectiveType === filter.id;
            return (
              <button
                key={filter.id}
                role="tab"
                id={tabButtonId(filter.id)}
                aria-selected={isActive}
                aria-controls={panelId}
                type="button"
                onClick={() => setActiveType(filter.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                  isActive
                    ? 'bg-white text-brand-blue-dark shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <filter.icon className="w-3.5 h-3.5" aria-hidden="true" />
                {t(filter.labelKey, { defaultValue: filter.labelDefault })}
              </button>
            );
          })}
        </div>
      )}
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={showFilter ? tabButtonId(effectiveType) : undefined}
        className="flex-1 min-h-0"
      >
        {effectiveType === 'quiz' ? (
          <PlcQuizzesBody plc={plc} onCloseDashboard={onCloseDashboard} />
        ) : (
          <PlcVideoActivitiesTabsBody plc={plc} />
        )}
      </div>
    </div>
  );
};
