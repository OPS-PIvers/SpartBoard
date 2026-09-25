import { User, Zap, Clock } from 'lucide-react';
import type { AssignModeOption } from './types';

/** Pacing modes shared by the Quiz and Video Activity settings panels. */
export const SESSION_MODES: Omit<AssignModeOption, 'disabled'>[] = [
  { id: 'teacher', label: 'Teacher-paced', icon: User },
  {
    id: 'auto',
    label: 'Auto-progress',
    description: 'Advances when all have answered',
    icon: Zap,
  },
  { id: 'student', label: 'Self-paced', icon: Clock },
];
