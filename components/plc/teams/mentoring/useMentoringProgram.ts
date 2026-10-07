// Shared data for the mentoring pages: tasks, workspaces and the viewer's own pair.

import { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import {
  useMentoringTasks,
  useMentoringWorkspaces,
} from '@/hooks/useMentoring';
import type { MentoringTask, MentoringWorkspace, Plc } from '@/types';
import { sortTasksByDue } from '@/utils/mentoring';

export interface MentoringProgramData {
  uid: string | null;
  tasks: MentoringTask[];
  workspaces: MentoringWorkspace[];
  /** The viewer's own workspaces (a mentor can have several). */
  mine: MentoringWorkspace[];
  now: number;
  loading: boolean;
}

export function useMentoringProgram(
  plc: Plc,
  isFacilitator: boolean
): MentoringProgramData {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const tasks = useMentoringTasks(plc.id);
  const workspaces = useMentoringWorkspaces(plc.id, uid, isFacilitator);
  const now = useMinuteClock();
  const sorted = useMemo(() => sortTasksByDue(tasks.items), [tasks.items]);
  const mine = useMemo(
    () =>
      uid ? workspaces.items.filter((w) => w.memberUids.includes(uid)) : [],
    [workspaces.items, uid]
  );
  return {
    uid,
    tasks: sorted,
    workspaces: workspaces.items,
    mine,
    now,
    loading: tasks.loading || workspaces.loading,
  };
}
