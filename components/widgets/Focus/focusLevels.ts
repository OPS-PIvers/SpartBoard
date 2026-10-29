import type { FocusLevel } from '@/types';

export const FOCUS_LEVEL_TEXT: Record<
  FocusLevel,
  { label: string; detail: string }
> = {
  monitor: {
    label: 'Monitor',
    detail: 'Students can open any site. You see their time away.',
  },
  redirect: {
    label: 'Redirect',
    detail: 'Other sites send students back to an allowed tab.',
  },
  lock: {
    label: 'Lock',
    detail: 'Only allowed sites open, and the browser stays fullscreen.',
  },
};
