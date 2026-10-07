// Today's Assessments and Resources bodies, wired as team pages.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlcResourceKind } from '@/types';
import { PlcAssessmentsBody } from '@/components/plc/bodies/PlcAssessmentsBody';
import { PlcSharedBoardsBody } from '@/components/plc/bodies/PlcSharedBoardsBody';
import { PlcResourcesBody } from '@/components/plc/resources/PlcResourcesBody';
import { PlcGroupLinks } from '@/components/plc/resources/PlcGroupLinks';
import { MenuSelect } from '@/components/plc/redesignMockup/ui';
import { useTeamNav } from '@/components/plc/teams/TeamNavContext';
import type { TeamPageProps } from '@/components/plc/teams/types';
import { teamShowsSharedBoards } from '@/utils/teamLayout';

const BODY = 'p-4 md:p-6';

export const TeamAssessmentsPage: React.FC<TeamPageProps> = ({ plc }) => {
  const nav = useTeamNav();
  return (
    <div className={BODY}>
      <PlcAssessmentsBody
        plc={plc}
        assessmentId={nav.assessmentId}
        onCloseDashboard={nav.close}
      />
    </div>
  );
};

/** Side panels run edge to edge; the shell drops its padding for them. */
type ResourceFilter = 'all' | 'links' | PlcResourceKind;

const ADMIN_KINDS: readonly PlcResourceKind[] = [
  'doc',
  'quiz',
  'video-activity',
  'assignment',
  'board',
];

/** T9: links, shared boards and admin resources on one page with a kind filter. */
export const TeamResourcesPage: React.FC<TeamPageProps> = ({ plc }) => {
  const { t } = useTranslation();
  const nav = useTeamNav();
  const boards = teamShowsSharedBoards(plc);
  // Old Shared Boards links open Resources filtered to boards.
  const [filter, setFilter] = useState<ResourceFilter>(
    boards && nav.section === 'sharedBoards' ? 'board' : 'all'
  );
  const shows = (kind: ResourceFilter) => filter === 'all' || filter === kind;

  const options: { value: ResourceFilter; label: string }[] = [
    { value: 'all', label: t('teams.resources.all', { defaultValue: 'All' }) },
    {
      value: 'links',
      label: t('plcDashboard.links.title', { defaultValue: 'Links' }),
    },
    ...(boards
      ? [
          {
            value: 'board' as const,
            label: t('plcDashboard.resources.kind.board', {
              defaultValue: 'Boards',
            }),
          },
        ]
      : []),
    {
      value: 'doc',
      label: t('plcDashboard.resources.kind.doc', {
        defaultValue: 'Documents',
      }),
    },
    {
      value: 'quiz',
      label: t('plcDashboard.resources.kind.quiz', {
        defaultValue: 'Quizzes',
      }),
    },
    {
      value: 'video-activity',
      label: t('plcDashboard.resources.kind.video-activity', {
        defaultValue: 'Video Activities',
      }),
    },
    {
      value: 'assignment',
      label: t('plcDashboard.resources.kind.assignment', {
        defaultValue: 'Assignments',
      }),
    },
  ];

  return (
    <div className={`${BODY} space-y-6`}>
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-slate-800">
          {t('plcDashboard.resources.inboxTitle', {
            defaultValue: 'Resources',
          })}
        </h2>
        <span className="flex-1" />
        <MenuSelect
          label={t('teams.resources.filter', { defaultValue: 'Filter' })}
          value={filter}
          options={options}
          onChange={(v) => setFilter(v as ResourceFilter)}
        />
      </div>
      {shows('links') && <PlcGroupLinks plc={plc} />}
      {boards && shows('board') && (
        <PlcSharedBoardsBody plc={plc} hideWhenEmpty={filter === 'all'} />
      )}
      {filter !== 'links' && (
        <PlcResourcesBody
          plc={plc}
          embedded
          kinds={filter === 'all' ? ADMIN_KINDS : [filter]}
          onNavigate={(id) => {
            if (id === 'sharedBoards') setFilter(boards ? 'board' : 'all');
            else nav.navigate(id);
          }}
        />
      )}
    </div>
  );
};
