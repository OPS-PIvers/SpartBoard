// PLC Home (`plc-home-tab`): the live data behind PlcHomeView.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, FileText, Library, Target } from 'lucide-react';
import { getPlcFeatures, type Plc } from '@/types';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';
import { usePlcNotes } from '@/hooks/usePlcNotes';
import { usePlcLinks } from '@/hooks/usePlcLinks';
import { GoalSection } from '@/components/plc/teams/data/heroes';
import {
  MasteryView,
  TagPrompt,
} from '@/components/plc/teams/data/DataOverviewSections';
import { ManageTargetsForPlc } from '@/components/plc/teams/data/DataOverviewPage';
import LatestUpdatesCard from '@/components/plc/teams/updates/LatestUpdatesCard';
import CalendarCard from '@/components/plc/teams/building/CalendarCard';
import { isCalendarEmbedUrl } from '@/utils/teamUpdates';
import { teamPageSection } from '@/components/plc/teams/teamSections';
import { useTeamShellActions } from '@/components/plc/teams/data/teamShellActions';
import { useDateFormat } from '@/components/plc/teams/data/format';
import { useTeamNav } from '@/components/plc/teams/TeamNavContext';
import {
  useDataOverviewModel,
  useMeetingStrip,
  usePlcNavigation,
} from '@/components/plc/teams/data/useDataOverview';
import { PlcHomeView, type PlcHomeTool } from './PlcHomeView';

export const PlcHomePage: React.FC<{
  plc: Plc;
  layout: ResolvedTeamLayout;
  isLead: boolean;
}> = ({ plc, layout, isLead }) => {
  const { t } = useTranslation();
  const fmt = useDateFormat();
  const { model, input } = useDataOverviewModel(plc, null);
  const strip = useMeetingStrip(plc);
  const nav = usePlcNavigation(plc.id);
  const teamNav = useTeamNav();
  const { openMyItems } = useTeamShellActions();
  const { notes } = usePlcNotes(plc.id);
  const { links } = usePlcLinks(plc.id);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const features = getPlcFeatures(plc);
  const hasTargets = features.quizzes || features.videoActivities;
  const enabledPages = new Set(
    layout.pages.filter((p) => p.enabled).map((p) => p.id)
  );

  const lastNoteAt = useMemo(
    () =>
      notes.reduce(
        (latest, n) => Math.max(latest, n.meetingAt ?? n.createdAt),
        0
      ),
    [notes]
  );
  const activeCount = input.assessments.filter(
    (a) => a.status === 'active'
  ).length;

  const tools: PlcHomeTool[] = [];
  if (enabledPages.has('assessments')) {
    const count = t('plcHome.assessmentCount', {
      count: input.assessments.length,
      defaultValue: '{{count}} assessments',
    });
    tools.push({
      id: 'assessments',
      label: t('teams.pages.assessments', { defaultValue: 'Assessments' }),
      icon: ClipboardList,
      meta:
        activeCount > 0
          ? t('plcHome.assessmentsOpen', {
              list: count,
              open: activeCount,
              defaultValue: '{{list}} · {{open}} open',
            })
          : count,
      onOpen: () => teamNav.navigate('assessments'),
    });
  }
  if (enabledPages.has('docs')) {
    tools.push({
      id: 'docs',
      label: t('teams.pages.docs', { defaultValue: 'Notes & Docs' }),
      icon: FileText,
      meta:
        lastNoteAt > 0
          ? t('plcHome.lastNote', {
              date: fmt(lastNoteAt),
              defaultValue: 'Last note {{date}}',
            })
          : t('plcHome.noNotes', { defaultValue: 'No notes yet' }),
      onOpen: () => teamNav.navigate('docs'),
    });
  }
  if (hasTargets) {
    tools.push({
      id: 'targets',
      label: t('plcDashboard.tabs.targets', {
        defaultValue: 'Learning Targets',
      }),
      icon: Target,
      meta: t('plcHome.targetCount', {
        count: input.targets.length,
        defaultValue: '{{count}} targets',
      }),
      onOpen: () => teamNav.navigate('targets'),
    });
  }
  if (enabledPages.has('resources')) {
    tools.push({
      id: 'resources',
      label: t('teams.pages.resources', { defaultValue: 'Resources' }),
      icon: Library,
      meta: t('plcHome.linkCount', {
        count: links.length,
        defaultValue: '{{count}} links',
      }),
      onOpen: () => teamNav.navigate('resources'),
    });
  }

  const mastery =
    model.featured && model.mastery ? (
      <MasteryView
        layer={model.mastery}
        isLead={isLead}
        onManageTargets={() => teamNav.navigate('targets')}
      />
    ) : model.featured && isLead ? (
      <TagPrompt onTag={() => setTargetsOpen(true)} />
    ) : null;

  return (
    <>
      <PlcHomeView
        model={model}
        cards={layout.cards}
        tools={tools}
        strip={{
          ...strip,
          onOpenNote: nav.openNotes,
          onViewItems: openMyItems ?? nav.openNotes,
        }}
        goal={<GoalSection plc={plc} isLead={isLead} />}
        mastery={mastery}
        updates={
          enabledPages.has('updates') ? (
            <LatestUpdatesCard
              plc={plc}
              isLead={isLead}
              onNavigate={(id) =>
                teamNav.navigate(teamPageSection(id, layout.landing, true))
              }
            />
          ) : null
        }
        calendar={
          isCalendarEmbedUrl(plc.calendarEmbedUrl) ? (
            <CalendarCard plc={plc} isLead={isLead} />
          ) : null
        }
        onOpenDataOverview={
          enabledPages.has('dataOverview')
            ? () => teamNav.navigate('dataOverview')
            : undefined
        }
        onOpenAssessment={nav.openAssessment}
        onAllAssessments={
          enabledPages.has('assessments') ? nav.allAssessments : undefined
        }
      />
      {targetsOpen && (
        <ManageTargetsForPlc
          plcId={plc.id}
          onClose={() => setTargetsOpen(false)}
        />
      )}
    </>
  );
};
