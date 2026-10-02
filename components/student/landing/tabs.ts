import type React from 'react';
import {
  BookOpen,
  ChartNoAxesColumn,
  CircleCheck,
  ListChecks,
} from 'lucide-react';
import type { LandingPartition } from '@/utils/studentLanding';
import type { LandingTab } from './types';

export interface LandingTabSpec {
  id: LandingTab;
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

/** D16: Completed becomes Gradebook when the student gradebook is on. */
export function landingTabs(
  p: LandingPartition,
  gradesEnabled: boolean,
  doneCount: number = p.done.length
): LandingTabSpec[] {
  return [
    {
      id: 'assignments',
      label: 'Assignments',
      count: p.work.length,
      icon: ListChecks,
    },
    {
      id: 'resources',
      label: 'Resources',
      count: p.resources.length,
      icon: BookOpen,
    },
    {
      id: 'completed',
      label: gradesEnabled ? 'Gradebook' : 'Completed',
      count: doneCount,
      icon: gradesEnabled ? ChartNoAxesColumn : CircleCheck,
    },
  ];
}

export const tabId = (classId: string, tab: LandingTab): string =>
  `landing-tab-${tab}-${classId}`;
export const panelId = (classId: string): string => `landing-panel-${classId}`;
