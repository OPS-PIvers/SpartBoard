// Mentoring hero (T6, T34): the next required task and its due date.

import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { HeroHead } from '@/components/plc/redesignMockup/DepartmentHubMock';
import {
  META,
  Section,
  StatusLabel,
  type StatusTone,
} from '@/components/plc/redesignMockup/ui';
import type { MentoringTask } from '@/types';
import type { MentoringPairStatus } from '@/utils/mentoring';
import {
  SUBMITTER_LABEL,
  dayAndDate,
  pairStatusLabel,
} from './mentoringFormat';

export interface NextTaskHeroViewProps {
  task: MentoringTask | null;
  isLead: boolean;
  /** The viewer's pair status and partner, for mentors and mentees. */
  pair?: { status: MentoringPairStatus; partnerName: string } | null;
  onEditLayout?: () => void;
  onOpenTracker?: () => void;
  onOpenWorkspace?: () => void;
  onPostTask?: () => void;
}

export const NextTaskHeroView: React.FC<NextTaskHeroViewProps> = ({
  task,
  isLead,
  pair,
  onEditLayout,
  onOpenTracker,
  onOpenWorkspace,
  onPostTask,
}) => {
  if (!task) {
    return (
      <Section first label="Next required task">
        <HeroHead
          eyebrow="Next required task"
          title="No required tasks yet."
          isLead={isLead && !!onEditLayout}
          onChange={onEditLayout}
          meta={null}
          actions={
            isLead && onPostTask ? (
              <Button
                size="sm"
                onClick={onPostTask}
                icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Post a task
              </Button>
            ) : null
          }
        />
      </Section>
    );
  }
  const [tone, label]: [StatusTone, string] = pair
    ? pairStatusLabel(pair.status)
    : ['none', ''];
  return (
    <Section first label="Next required task">
      <HeroHead
        eyebrow={`Next required task · due ${dayAndDate(task.dueDate)}`}
        title={task.title}
        isLead={isLead && !!onEditLayout}
        onChange={onEditLayout}
        meta={`Submits: ${SUBMITTER_LABEL[task.submitter]}${
          task.templateDoc ? ' · template doc in each workspace' : ''
        }`}
        actions={
          isLead ? (
            <Button variant="secondary" size="sm" onClick={onOpenTracker}>
              Open tracker
            </Button>
          ) : pair ? (
            <Button size="sm" onClick={onOpenWorkspace}>
              Open in workspace
            </Button>
          ) : null
        }
      />
      {task.instructions && (
        <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-700">
          {task.instructions}
        </p>
      )}
      {!isLead && pair && (
        <p className="mt-3 flex flex-wrap items-center gap-3">
          <StatusLabel tone={tone}>{label}</StatusLabel>
          {pair.partnerName && (
            <span className={META}>Your workspace with {pair.partnerName}</span>
          )}
        </p>
      )}
    </Section>
  );
};
