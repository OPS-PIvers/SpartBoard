// QuizLiveMonitor — teacher view during a live quiz session.
// Rebuilt 2026-08 to the approved calm-default-face design; the implementation
// lives in ./monitor (see docs/plans/shipped/QUIZ_INTERFACE_REDESIGN.md).

import React, { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { MonitorShell, QuizLiveMonitorProps } from './monitor/MonitorShell';
import { MonitorShell as LegacyMonitorShell } from './monitor/legacy/LegacyMonitorShell';

export type { QuizLiveMonitorProps };

// Pre-declutter monitor stays the default until 'quiz-monitor-declutter' opens.
export const QuizLiveMonitor: React.FC<QuizLiveMonitorProps> = (props) => {
  const auth = useContext(AuthContext);
  return auth?.canAccessFeature('quiz-monitor-declutter') ? (
    <MonitorShell {...props} />
  ) : (
    <LegacyMonitorShell {...props} />
  );
};
