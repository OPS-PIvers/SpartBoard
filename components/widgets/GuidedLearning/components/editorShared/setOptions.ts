import type {
  GuidedLearningInteractionType,
  GuidedLearningMode,
} from '@/types';

export const MODE_OPTIONS: {
  value: GuidedLearningMode;
  label: string;
  desc: string;
}[] = [
  {
    value: 'structured',
    label: 'Structured',
    desc: 'Step-by-step with Prev/Next',
  },
  { value: 'guided', label: 'Guided', desc: 'Auto-advances with Play/Pause' },
  { value: 'explore', label: 'Explore', desc: 'Student clicks any hotspot' },
];

export const PULSE_OPTIONS: {
  value: 'consistent' | 'reminder' | 'off';
  label: string;
  desc?: string;
}[] = [
  { value: 'consistent', label: 'Consistent', desc: 'Pulses constantly' },
  { value: 'reminder', label: 'Reminder', desc: 'Shakes every few seconds' },
  { value: 'off', label: 'Off' },
];

export const TRANSITION_OPTIONS: {
  value: 'none' | 'slide' | 'fade';
  label: string;
  desc?: string;
}[] = [
  { value: 'none', label: 'None' },
  { value: 'slide', label: 'Slide' },
  { value: 'fade', label: 'Fade' },
];

export const INTERACTION_TYPES: {
  value: GuidedLearningInteractionType;
  label: string;
}[] = [
  { value: 'text-popover', label: 'Text Popover' },
  { value: 'tooltip', label: 'Tooltip' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'pan-zoom', label: 'Pan & Zoom' },
  { value: 'pan-zoom-spotlight', label: 'Pan & Zoom + Spotlight' },
  { value: 'spotlight', label: 'Spotlight' },
  { value: 'question', label: 'Question' },
];
