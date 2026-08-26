// QuizLiveMonitor — teacher view during a live quiz session.
// Rebuilt 2026-08 to the approved calm-default-face design; the implementation
// lives in ./monitor (see docs/plans/QUIZ_INTERFACE_REDESIGN.md).

import React from 'react';
import { MonitorShell, QuizLiveMonitorProps } from './monitor/MonitorShell';

export type { QuizLiveMonitorProps };

export const QuizLiveMonitor: React.FC<QuizLiveMonitorProps> = (props) => (
  <MonitorShell {...props} />
);
