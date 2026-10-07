// Layout editor data: pinnable items from the team's assessments, targets, goals, notes and docs.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPlcGroupType, type Plc, type PlcTeamLayout } from '@/types';
import type { TeamTypeDefaults } from '@/types';
import {
  featuresForTeamLayout,
  type ResolvedTeamLayout,
} from '@/utils/teamLayout';
import { saveTeamLayout } from '@/hooks/useTeamLayout';
import { usePlcAssessments } from '@/hooks/usePlcAssessments';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { usePlcGoals } from '@/hooks/usePlcGoals';
import { usePlcLearningTargets } from '@/hooks/useLearningTargets';
import { usePlcNotesData } from '@/context/usePlcContext';
import { usePlcAggregate } from '@/hooks/usePlcAggregate';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import { isCalendarEmbedUrl } from '@/utils/teamUpdates';
import { selectNewerHeroData } from '@/components/plc/teams/heroes/heroStaleness';
import { heroPinner } from '@/components/plc/teams/heroes/heroPin';
import { teamHeroKindLabel } from '@/components/plc/teams/teamLabels';
import { districtDefaultLayout } from '@/components/plc/teams/teamRollout';
import { LayoutEditorView, type HeroPinGroup } from './LayoutEditorView';

export const TeamLayoutEditor: React.FC<{
  plc: Plc;
  layout: ResolvedTeamLayout;
  adminDefaults: TeamTypeDefaults | null;
  /** The admin defaults read failed, so there is no district default to reset to. */
  defaultsFailed?: boolean;
  isLead: boolean;
  onClose: () => void;
}> = ({
  plc,
  layout,
  adminDefaults,
  defaultsFailed = false,
  isLead,
  onClose,
}) => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const { assessments } = usePlcAssessments(plc.id);
  const { aggregates } = usePlcAggregate(plc.id);
  const { docs } = usePlcDocs(plc.id);
  const { data: notes } = usePlcNotesData();
  const { goals } = usePlcGoals(plc.id);
  const { list: targetList } = usePlcLearningTargets(plc.id);

  const pinGroups = useMemo<HeroPinGroup[]>(() => {
    const dated = (a: (typeof assessments)[number]) =>
      a.opensAt ?? a.dueAt ?? a.updatedAt;
    return [
      {
        label: teamHeroKindLabel(t, 'assessment'),
        options: [...assessments]
          .filter((a) => a.deletedAt == null)
          .sort((a, b) => dated(b) - dated(a))
          .map((a) => ({
            ref: { kind: 'assessment', assessmentId: a.id },
            label: a.title,
          })),
      },
      {
        label: teamHeroKindLabel(t, 'target'),
        options: (targetList?.targets ?? [])
          .filter((target) => !target.archived)
          .map((target) => ({
            ref: { kind: 'target', targetId: target.id },
            label: [target.code, target.label].filter(Boolean).join(' '),
          })),
      },
      {
        label: teamHeroKindLabel(t, 'goal'),
        options: goals.map((g) => ({
          ref: { kind: 'goal', goalId: g.id },
          label: g.title,
        })),
      },
      {
        label: teamHeroKindLabel(t, 'doc'),
        options: [
          ...docs.map((d) => ({
            ref: { kind: 'doc' as const, docId: d.id },
            label: d.title,
          })),
          ...notes
            .filter((n) => n.deletedAt == null)
            .map((n) => ({
              ref: { kind: 'note' as const, noteId: n.id },
              label: n.title,
            })),
        ],
      },
      {
        label: teamHeroKindLabel(t, 'calendar'),
        options: isCalendarEmbedUrl(plc.calendarEmbedUrl)
          ? [
              {
                ref: { kind: 'calendar' },
                label: t('teams.layout.teamCalendar', {
                  name: plc.name,
                  defaultValue: '{{name}} calendar',
                }),
              },
            ]
          : [],
      },
    ];
  }, [
    assessments,
    targetList,
    goals,
    docs,
    notes,
    plc.calendarEmbedUrl,
    plc.name,
    t,
  ]);

  const districtDefault = useMemo(
    () => (defaultsFailed ? null : districtDefaultLayout(plc, adminDefaults)),
    [plc, adminDefaults, defaultsFailed]
  );

  const handleSave = (next: PlcTeamLayout) => {
    setSaving(true);
    saveTeamLayout(plc.id, next, featuresForTeamLayout(plc, next))
      .then(onClose)
      .catch((err: unknown) => {
        logError('TeamLayoutEditor.save', err, { plcId: plc.id });
        addToast(
          t('teams.layout.saveFailed', {
            defaultValue: "Couldn't save the team layout.",
          }),
          'error'
        );
        setSaving(false);
      });
  };

  return (
    <LayoutEditorView
      groupType={getPlcGroupType(plc)}
      layout={layout}
      heroRule={layout.heroRule}
      districtDefault={districtDefault}
      pinGroups={pinGroups}
      newerFor={(ref) => selectNewerHeroData(ref, aggregates, assessments)}
      isLead={isLead}
      pinner={heroPinner(user)}
      saving={saving}
      onSave={handleSave}
      onClose={onClose}
    />
  );
};
