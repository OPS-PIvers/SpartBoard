// Program Hub `nextTask` card (T34): a mentor's or mentee's tasks and where each stands.

import { pairTaskStatus } from '@/utils/mentoring';
import { YourTasksView } from './ProgramHubCards';
import type { TeamCardProps } from './teamContract';
import { useMentoringProgram } from './useMentoringProgram';

export default function NextTaskCard({ plc, isLead }: TeamCardProps) {
  const data = useMentoringProgram(plc, isLead);
  if (isLead || data.loading || data.tasks.length === 0) return null;
  const own = data.mine[0] ?? { taskStatus: {} };
  return (
    <YourTasksView
      rows={data.tasks.map((task) => ({
        task,
        status: pairTaskStatus(task, own, data.now),
      }))}
    />
  );
}
