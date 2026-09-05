import {
  WidgetType,
  WidgetConfig,
  TimeToolConfig,
  SoundConfig,
  TrafficConfig,
  RandomConfig,
  PollConfig,
  GradeLevel,
} from '@/types';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';

/**
 * Builds the human-readable "grades" label shown on a routine's library card
 * (e.g. "K-2, 3-5"). Sorts by canonical grade-band order (ALL_GRADE_LEVELS),
 * not string order — a plain `.sort()` on uppercased labels puts '3-5' before
 * 'K-2' (digits sort before letters), scrambling the displayed order.
 */
export function formatGradeLevelsLabel(gradeLevels: GradeLevel[]): string {
  if (gradeLevels.length === 0) return 'None';
  if (gradeLevels.length >= ALL_GRADE_LEVELS.length) return 'Universal';
  return [...gradeLevels]
    .sort((a, b) => ALL_GRADE_LEVELS.indexOf(a) - ALL_GRADE_LEVELS.indexOf(b))
    .map((l) => l.toUpperCase())
    .join(', ');
}

export const QUICK_TOOLS: {
  label: string;
  type: WidgetType | 'none';
  config?: WidgetConfig;
}[] = [
  { label: 'None', type: 'none' },
  {
    label: 'Timer (1 min)',
    type: 'time-tool',
    config: {
      ...(WIDGET_DEFAULTS['time-tool'].config as TimeToolConfig),
      mode: 'timer',
      duration: 60,
      isRunning: true,
    },
  },
  {
    label: 'Timer (2 min)',
    type: 'time-tool',
    config: {
      ...(WIDGET_DEFAULTS['time-tool'].config as TimeToolConfig),
      mode: 'timer',
      duration: 120,
      isRunning: true,
    },
  },
  {
    label: 'Timer (5 min)',
    type: 'time-tool',
    config: {
      ...(WIDGET_DEFAULTS['time-tool'].config as TimeToolConfig),
      mode: 'timer',
      duration: 300,
      isRunning: true,
    },
  },
  {
    label: 'Stopwatch',
    type: 'time-tool',
    config: {
      ...(WIDGET_DEFAULTS['time-tool'].config as TimeToolConfig),
      mode: 'stopwatch',
      isRunning: true,
    },
  },
  {
    label: 'Noise Meter',
    type: 'sound',
    config: {
      ...(WIDGET_DEFAULTS['sound'].config as SoundConfig),
      sensitivity: 50,
      visual: 'balls',
    },
  },
  {
    label: 'Traffic Light',
    type: 'traffic',
    config: {
      ...(WIDGET_DEFAULTS['traffic'].config as TrafficConfig),
      active: 'red',
    },
  },
  {
    label: 'Random Picker',
    type: 'random',
    config: {
      ...(WIDGET_DEFAULTS['random'].config as RandomConfig),
      mode: 'spinner',
    },
  },
  {
    label: 'Poll',
    type: 'poll',
    config: {
      ...(WIDGET_DEFAULTS['poll'].config as PollConfig),
      question: '',
      options: [],
    },
  },
];
