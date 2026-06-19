// components/plc/sections.ts
import {
  LayoutDashboard,
  BookOpen,
  Film,
  BarChart3,
  FileText,
  ListChecks,
  SquareSquare,
  Users2,
  Sparkles,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { PlcFeatureSettings } from '@/types';

export type PlcSectionId =
  | 'home'
  | 'quizzes'
  | 'videoActivities'
  | 'sharedData'
  | 'docs'
  | 'todos'
  | 'sharedBoards'
  | 'members'
  | 'resources'
  | 'settings'
  // Reserved for later waves (Meeting Mode — PRD §6.2). It is a valid route
  // section so `/plc/:id/meeting` parses cleanly, but it is intentionally NOT
  // in `PLC_SECTIONS` yet, so it does not appear in the rail this wave.
  | 'meeting';

/**
 * Every section id the router will accept in a `/plc/:plcId/:section` path.
 * Includes `meeting` (reserved for Meeting Mode) even though it is not yet a
 * rail item — the router needs to recognise it so deep links don't fall back
 * to home. Derived from the `PlcSectionId` union so the two never drift.
 */
export const PLC_SECTION_IDS: ReadonlySet<PlcSectionId> = new Set<PlcSectionId>(
  [
    'home',
    'quizzes',
    'videoActivities',
    'sharedData',
    'docs',
    'todos',
    'sharedBoards',
    'members',
    'resources',
    'settings',
    'meeting',
  ]
);

/** Type guard: is `value` a valid PLC section id (for router parsing)? */
export function isPlcSectionId(value: unknown): value is PlcSectionId {
  return (
    typeof value === 'string' && PLC_SECTION_IDS.has(value as PlcSectionId)
  );
}

export interface PlcSectionDef {
  id: PlcSectionId;
  icon: LucideIcon;
  labelKey: string;
  labelDefault: string;
  /** Feature flag gating this section; absent = always shown. */
  feature?: keyof PlcFeatureSettings;
}

export const PLC_SECTIONS: readonly PlcSectionDef[] = [
  {
    id: 'home',
    icon: LayoutDashboard,
    labelKey: 'plcDashboard.tabs.home',
    labelDefault: 'Home',
  },
  {
    id: 'quizzes',
    icon: BookOpen,
    labelKey: 'plcDashboard.tabs.quizzes',
    labelDefault: 'Quizzes',
    feature: 'quizzes',
  },
  {
    id: 'videoActivities',
    icon: Film,
    labelKey: 'plcDashboard.tabs.videoActivities',
    labelDefault: 'Video Activities',
    feature: 'videoActivities',
  },
  {
    id: 'sharedData',
    icon: BarChart3,
    labelKey: 'plcDashboard.tabs.sharedData',
    labelDefault: 'Shared Data',
  },
  {
    id: 'docs',
    icon: FileText,
    labelKey: 'plcDashboard.tabs.docs',
    labelDefault: 'Docs',
    feature: 'notes',
  },
  {
    id: 'todos',
    icon: ListChecks,
    labelKey: 'plcDashboard.tabs.todos',
    labelDefault: 'To-Dos',
    feature: 'todos',
  },
  {
    id: 'sharedBoards',
    icon: SquareSquare,
    labelKey: 'plcDashboard.tabs.sharedBoards',
    labelDefault: 'Shared Boards',
    feature: 'sharedBoards',
  },
  {
    id: 'members',
    icon: Users2,
    labelKey: 'plcDashboard.tabs.members',
    labelDefault: 'Members',
  },
  {
    id: 'resources',
    icon: Sparkles,
    labelKey: 'plcDashboard.tabs.resources',
    labelDefault: 'Resources',
  },
  {
    id: 'settings',
    icon: SettingsIcon,
    labelKey: 'plcDashboard.tabs.settings',
    labelDefault: 'Settings',
  },
] as const;
