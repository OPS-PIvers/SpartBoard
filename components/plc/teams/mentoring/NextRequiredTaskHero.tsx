// Hero for the `nextRequiredTask` default rule (T6): data wrapper around NextTaskHeroView.

import React, { useState } from 'react';
import { nextRequiredTask, pairNames, pairTaskStatus } from '@/utils/mentoring';
import { NextTaskHeroView } from './NextTaskHeroView';
import { PostTaskModal } from './PostTaskModal';
import { goToTeamPage } from './teamRegistryBridge';
import type { TeamHeroProps, TeamNav } from './teamContract';
import { useMentoringProgram } from './useMentoringProgram';

export default function NextRequiredTaskHero({
  plc,
  isLead,
  onNavigate,
  onEditLayout,
}: TeamHeroProps & TeamNav) {
  const data = useMentoringProgram(plc, isLead);
  const [posting, setPosting] = useState(false);
  const own = isLead ? null : (data.mine[0] ?? null);
  const task = nextRequiredTask(data.tasks, data.now, own);
  const goWorkspace = () =>
    onNavigate ? onNavigate('workspace') : goToTeamPage(plc.id, 'workspace');
  let pair = null;
  if (own && task && data.uid) {
    const names = pairNames(plc, own);
    pair = {
      status: pairTaskStatus(task, own, data.now),
      partnerName: data.uid === own.mentorUid ? names.mentee : names.mentor,
    };
  }
  if (data.loading) return null;
  return (
    <>
      <NextTaskHeroView
        task={task}
        isLead={isLead}
        pair={pair}
        onEditLayout={onEditLayout}
        onOpenTracker={goWorkspace}
        onOpenWorkspace={goWorkspace}
        onPostTask={() => setPosting(true)}
      />
      {posting && (
        <PostTaskModal
          plc={plc}
          workspaces={data.workspaces}
          onClose={() => setPosting(false)}
        />
      )}
    </>
  );
}
