import React from 'react';
import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import type { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { usePlcLearningTargets } from '@/hooks/useLearningTargets';
import { useStandardsCatalog } from '@/hooks/useStandardsCatalog';
import { getPlcRole } from '@/utils/plc';
import { LearningTargetsManager } from '@/components/plc/settings/LearningTargetsManager';

interface PlcLearningTargetsBodyProps {
  plc: Plc;
}

/** Shared PLC learning targets; any non-viewer member edits. */
export const PlcLearningTargetsBody: React.FC<PlcLearningTargetsBodyProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user ? getPlcRole(plc, user.uid) : null;
  const canEdit = role !== null && role !== 'viewer';
  const learningTargets = usePlcLearningTargets(plc.id);
  const { benchmarks } = useStandardsCatalog();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Target className="w-4 h-4 text-slate-500" aria-hidden="true" />
          {t('plcDashboard.learningTargets.heading', {
            defaultValue: 'Learning targets',
          })}
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          {t('plcDashboard.learningTargets.description', {
            defaultValue:
              'Targets the PLC tags quiz questions with. Every member sees the same list.',
          })}
        </p>
      </div>
      <LearningTargetsManager
        list={learningTargets.list}
        onSave={learningTargets.save}
        canEdit={canEdit}
        showMasteryCutoffs
        standards={benchmarks}
      />
    </div>
  );
};
