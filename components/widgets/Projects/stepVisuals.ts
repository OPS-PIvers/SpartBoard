import type { LucideIcon } from 'lucide-react';
import { Check, Ellipsis, Flag } from 'lucide-react';
import type { ProjectStepState } from '@/types';

/** Purposeful colour, one hue per state, each with a mark so colour is never the only cue. */
export const STATE_STYLES: Record<
  ProjectStepState,
  { tone: string; Mark: LucideIcon | null }
> = {
  notStarted: { tone: 'bg-slate-300/70', Mark: null },
  inProgress: { tone: 'bg-brand-blue-primary text-white', Mark: Ellipsis },
  readyForReview: { tone: 'bg-amber-400 text-amber-950', Mark: Flag },
  done: { tone: 'bg-emerald-600 text-white', Mark: Check },
};
