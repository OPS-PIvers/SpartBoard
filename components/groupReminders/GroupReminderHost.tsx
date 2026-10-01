import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { GroupReminderLayer } from './GroupReminderLayer';

/** Feeds the teacher's loaded class rosters to the reminder layer. */
export const GroupReminderHost: React.FC = () => {
  const { rosters } = useDashboard();
  return <GroupReminderLayer rosters={rosters} />;
};
