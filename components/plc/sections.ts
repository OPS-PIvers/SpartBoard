// components/plc/sections.ts
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Film,
  BarChart3,
  FileText,
  ListChecks,
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
  | 'assignments'
  | 'sharedData'
  | 'docs'
  | 'todos'
  | 'members'
  | 'resources'
  | 'settings';

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
    id: 'assignments',
    icon: ClipboardList,
    labelKey: 'plcDashboard.tabs.assignments',
    labelDefault: 'Assignments',
    feature: 'assignments',
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
