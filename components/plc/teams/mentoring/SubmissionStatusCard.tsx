// Program Hub `submissionStatus` card (T34), facilitators only: submitted, late and not started per task.

import { summarizeTask } from '@/utils/mentoring';
import { SubmissionStatusView } from './ProgramHubCards';
import type { TeamCardProps } from './teamContract';
import { useMentoringProgram } from './useMentoringProgram';

export default function SubmissionStatusCard({ plc, isLead }: TeamCardProps) {
  const data = useMentoringProgram(plc, isLead);
  if (!isLead || data.loading || data.tasks.length === 0) return null;
  return (
    <SubmissionStatusView
      total={data.workspaces.length}
      summaries={data.tasks.map((t) =>
        summarizeTask(t, data.workspaces, data.now)
      )}
    />
  );
}
