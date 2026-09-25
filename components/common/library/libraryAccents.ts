import type { WidgetType } from '@/types';

// A darker shade of each widget's dock colour, so white header text stays above 4.5:1.
export const LIBRARY_HEADER_ACCENTS: Partial<Record<WidgetType, string>> = {
  quiz: '#6d28d9', // violet-700
  'video-activity': '#b91c1c', // red-700
  'guided-learning': '#4338ca', // indigo-700
  miniApp: '#0f766e', // teal-700
  flashcards: '#be123c', // rose-700
  projects: '#0369a1', // sky-700
  'activity-wall': '#a21caf', // fuchsia-700
};
