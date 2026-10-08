// Option sets for the assign stepper's top switch (docs/plans/ASSIGN_STEPPER.md D2).
import { BookOpen, PenLine, Play, User } from 'lucide-react';
import type { AssignKind } from './assignSteps';
import type { AssignTopSwitchOption } from './AssignTopSwitch';

export type AssignPacing = 'student' | 'teacher';

export const KIND_SWITCH_OPTIONS: AssignTopSwitchOption<AssignKind>[] = [
  { value: 'work', label: 'Students submit work', icon: PenLine },
  { value: 'resource', label: 'Study resource', icon: BookOpen },
];

export const PACING_SWITCH_OPTIONS: AssignTopSwitchOption<AssignPacing>[] = [
  { value: 'student', label: 'Self-paced', icon: User },
  { value: 'teacher', label: 'Teacher-paced (live)', icon: Play },
];
