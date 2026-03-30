import type { LucideIcon } from 'lucide-react';
import {
  AlarmClock,
  Award,
  BookOpen,
  Brain,
  Calculator,
  CircleHelp,
  ClipboardList,
  Gamepad2,
  GraduationCap,
  Grid3X3,
  Lightbulb,
  Medal,
  Microscope,
  Music2,
  Palette,
  Puzzle,
  Rocket,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  Wand2,
} from 'lucide-react';

export interface CustomWidgetIconOption {
  key: string;
  label: string;
  icon: LucideIcon;
}

export const CUSTOM_WIDGET_ICON_OPTIONS: CustomWidgetIconOption[] = [
  { key: 'Puzzle', label: 'Puzzle', icon: Puzzle },
  { key: 'Sparkles', label: 'Sparkles', icon: Sparkles },
  { key: 'Star', label: 'Star', icon: Star },
  { key: 'Trophy', label: 'Trophy', icon: Trophy },
  { key: 'Award', label: 'Award', icon: Award },
  { key: 'Medal', label: 'Medal', icon: Medal },
  { key: 'Target', label: 'Target', icon: Target },
  { key: 'Rocket', label: 'Rocket', icon: Rocket },
  { key: 'Lightbulb', label: 'Idea', icon: Lightbulb },
  { key: 'Brain', label: 'Brain', icon: Brain },
  { key: 'GraduationCap', label: 'School', icon: GraduationCap },
  { key: 'BookOpen', label: 'Reading', icon: BookOpen },
  { key: 'ClipboardList', label: 'Checklist', icon: ClipboardList },
  { key: 'Calculator', label: 'Math', icon: Calculator },
  { key: 'Microscope', label: 'Science', icon: Microscope },
  { key: 'Music2', label: 'Music', icon: Music2 },
  { key: 'Palette', label: 'Art', icon: Palette },
  { key: 'Gamepad2', label: 'Game', icon: Gamepad2 },
  { key: 'Timer', label: 'Timer', icon: Timer },
  { key: 'AlarmClock', label: 'Clock', icon: AlarmClock },
  { key: 'Grid3X3', label: 'Grid', icon: Grid3X3 },
  { key: 'CircleHelp', label: 'Help', icon: CircleHelp },
  { key: 'Wand2', label: 'Magic', icon: Wand2 },
];

const ICON_LOOKUP = new Map(
  CUSTOM_WIDGET_ICON_OPTIONS.map((option) => [option.key, option.icon])
);

export function getCustomWidgetIcon(iconKey: string): LucideIcon | null {
  return ICON_LOOKUP.get(iconKey) ?? null;
}
