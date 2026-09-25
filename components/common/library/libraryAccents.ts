import type { WidgetType } from '@/types';

// A darker shade of each widget's dock colour, so white header text stays above 4.5:1. No purples.
export const LIBRARY_HEADER_ACCENTS: Partial<Record<WidgetType, string>> = {
  quiz: '#047857', // emerald-700
  'video-activity': '#b91c1c', // red-700
  'guided-learning': '#b45309', // amber-700
  miniApp: '#334155', // slate-700
  flashcards: '#be185d', // pink-700
  projects: '#0369a1', // sky-700
  'activity-wall': '#c2410c', // orange-700
};
