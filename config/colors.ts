export const STANDARD_COLORS = {
  slate: '#1e293b', // slate-800
  red: '#ef4444', // red-500
  orange: '#f97316', // orange-500
  amber: '#f59e0b', // amber-500
  yellow: '#eab308', // yellow-500
  green: '#22c55e', // green-500
  emerald: '#10b981', // emerald-500
  teal: '#14b8a6', // teal-500
  cyan: '#06b6d4', // cyan-500
  blue: '#3b82f6', // blue-500
  indigo: '#6366f1', // indigo-500
  violet: '#8b5cf6', // violet-500
  purple: '#a855f7', // purple-500
  pink: '#ec4899', // pink-500
  rose: '#f43f5e', // rose-500
} as const;

export const WIDGET_PALETTE = [
  STANDARD_COLORS.slate,
  STANDARD_COLORS.red,
  STANDARD_COLORS.amber,
  STANDARD_COLORS.emerald,
  STANDARD_COLORS.blue,
  STANDARD_COLORS.violet,
  STANDARD_COLORS.pink,
];

export const TRANSPARENT_BG_URL =
  'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAACVJREFUGF5jYACC/wwMIAYDAwMIAIn///8DAxgDCAKEMDAwgAgABswNCv79YRAAAAAASUVORK5CYII=")';

// For RandomWidget which uses lighter colors for contrast with text
export const PASTEL_PALETTE = [
  '#f87171', // red-400
  '#fbbf24', // amber-400
  '#34d399', // emerald-400
  '#60a5fa', // blue-400
  '#818cf8', // indigo-400
  '#a78bfa', // violet-400
  '#f472b6', // pink-400
  '#2DD4BF', // teal-400
];

// For TextWidget (Sticky Notes) background colors
export const STICKY_NOTE_COLORS = {
  yellow: '#fef9c3', // yellow-100
  green: '#dcfce7', // green-100
  blue: '#dbeafe', // blue-100
  pink: '#fce7f3', // pink-100
  gray: '#f3f4f6', // gray-100
} as const;

export const ROUTINE_COLORS = [
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'slate',
  'zinc',
  'stone',
  'neutral',
] as const;

export const ROUTINE_STEP_COLORS = [
  'blue',
  'amber',
  'indigo',
  'green',
  'slate',
  'purple',
  'rose',
] as const;
