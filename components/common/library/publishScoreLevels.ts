import type React from 'react';
import { CheckCircle2, ListChecks, Trophy } from 'lucide-react';
import type { PublishScoresVisibility } from './PublishScoresModal';

export interface VisibilityOption {
  id: PublishScoresVisibility;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
}

/** Published-results levels, shared by the class publish modal and per-student publishing. */
export const PUBLISH_LEVEL_OPTIONS: VisibilityOption[] = [
  {
    id: 'score-only',
    title: 'Score only',
    Icon: Trophy,
  },
  {
    id: 'score-and-responses',
    title: 'Score & Responses',
    Icon: ListChecks,
  },
  {
    id: 'score-responses-and-answers',
    title: 'Score, Responses, & Answers',
    Icon: CheckCircle2,
  },
];
