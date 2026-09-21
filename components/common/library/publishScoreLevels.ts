import type React from 'react';
import { CheckCircle2, ListChecks, Trophy } from 'lucide-react';
import type { PublishScoresVisibility } from './PublishScoresModal';

export interface VisibilityOption {
  id: PublishScoresVisibility;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
}

/** Published-results levels, shared by the class publish modal and per-student publishing. */
export const PUBLISH_LEVEL_OPTIONS: VisibilityOption[] = [
  {
    id: 'score-only',
    title: 'Score only',
    body: 'Students see just their final score.',
    Icon: Trophy,
  },
  {
    id: 'score-and-responses',
    title: 'Score & Responses',
    body: 'Students see their score and which of their answers were correct or incorrect.',
    Icon: ListChecks,
  },
  {
    id: 'score-responses-and-answers',
    title: 'Score, Responses, & Answers',
    body: 'Students see their score, their answers marked correct or incorrect, and the correct answer for each question.',
    Icon: CheckCircle2,
  },
];
