import React from 'react';
import type { ClassRoster } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { GroupReminderLayer } from './GroupReminderLayer';

const NO_ROSTERS: ClassRoster[] = [];

/** Feeds the teacher's loaded class rosters to the reminder layer. */
export const GroupReminderHost: React.FC = () => {
  const { rosters } = useDashboard();
  // Partial dashboard values (tests, read-only hosts) may omit rosters.
  return (
    <GroupReminderLayer
      rosters={Array.isArray(rosters) ? rosters : NO_ROSTERS}
    />
  );
};
