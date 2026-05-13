/**
 * Phase A mockup data for the substitute teacher flow.
 *
 * Real /subs screens (Phase 4) will pull from Firestore:
 *   - Buildings from `useAdminBuildings()`
 *   - Shared boards via `query(/shared_boards, where intendedMode == 'substitute' ...)`
 *
 * Keep this file isolated so it can be deleted in one move once the live
 * data path is wired up.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BookOpen,
  CalendarDays,
  Clock,
  GraduationCap,
  HandMetal,
  Music,
  Notebook,
  Shuffle,
  Timer,
  Trophy,
  Utensils,
} from 'lucide-react';

export interface MockBuilding {
  id: string;
  name: string;
  gradeLabel: string;
}

export interface MockSharedBoard {
  shareId: string;
  buildingId: string;
  teacherName: string;
  teacherInitials: string;
  room?: string;
  gradeLabel?: string;
  boardName: string;
  expiresAt: number;
  widgetCount: number;
  accentColor: string; // tailwind bg- class for the card avatar
}

export interface MockWidget {
  id: string;
  type: string;
  title: string;
  icon: LucideIcon;
  // Layout in CSS grid columns/rows. The Phase A "board" is a 4-col x 3-row
  // layout — we lay it out by hand, not the real DraggableWindow engine.
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  /** Discriminator the renderer switches on to pick a placeholder. */
  preview: WidgetPreviewKind;
}

export type WidgetPreviewKind =
  | 'clock'
  | 'schedule'
  | 'lunch'
  | 'timer'
  | 'randomizer'
  | 'noise'
  | 'attention'
  | 'notes'
  | 'scoreboard'
  | 'music';

export const MOCK_BUILDINGS: MockBuilding[] = [
  { id: 'high', name: 'Orono High School', gradeLabel: '9-12' },
  { id: 'middle', name: 'Orono Middle School', gradeLabel: '6-8' },
  { id: 'intermediate', name: 'Orono Intermediate', gradeLabel: '3-5' },
  { id: 'schumann', name: 'Schumann Elementary', gradeLabel: 'K-2' },
];

const HOUR = 60 * 60 * 1000;

export const MOCK_SHARED_BOARDS: MockSharedBoard[] = [
  {
    shareId: 'sub-1',
    buildingId: 'middle',
    teacherName: 'Ms. Johnson',
    teacherInitials: 'MJ',
    room: 'Room 204',
    gradeLabel: 'Grade 6 ELA',
    boardName: 'Morning Block',
    expiresAt: Date.now() + 7 * HOUR,
    widgetCount: 6,
    accentColor: 'bg-brand-blue-primary',
  },
  {
    shareId: 'sub-2',
    buildingId: 'middle',
    teacherName: 'Mr. Patel',
    teacherInitials: 'AP',
    room: 'Room 118',
    gradeLabel: 'Grade 7 Math',
    boardName: 'Period 3 — Algebra',
    expiresAt: Date.now() + 22 * HOUR,
    widgetCount: 5,
    accentColor: 'bg-emerald-600',
  },
  {
    shareId: 'sub-3',
    buildingId: 'middle',
    teacherName: 'Ms. Nguyen',
    teacherInitials: 'TN',
    room: 'Room 312',
    gradeLabel: 'Grade 8 Science',
    boardName: 'Science Block',
    expiresAt: Date.now() + 30 * HOUR,
    widgetCount: 8,
    accentColor: 'bg-amber-500',
  },
  {
    shareId: 'sub-4',
    buildingId: 'high',
    teacherName: 'Mr. Larson',
    teacherInitials: 'JL',
    room: 'Room 245',
    gradeLabel: 'Grade 10 History',
    boardName: 'World History — Block 2',
    expiresAt: Date.now() + 4 * HOUR,
    widgetCount: 4,
    accentColor: 'bg-rose-500',
  },
  {
    shareId: 'sub-5',
    buildingId: 'schumann',
    teacherName: 'Ms. Reyes',
    teacherInitials: 'CR',
    room: 'Room 11',
    gradeLabel: 'Grade 1',
    boardName: 'First Grade — Full Day',
    expiresAt: Date.now() + 28 * HOUR,
    widgetCount: 9,
    accentColor: 'bg-violet-500',
  },
];

export function getMockBoardWidgets(): MockWidget[] {
  return [
    {
      id: 'w-clock',
      type: 'clock',
      title: 'Clock',
      icon: Clock,
      col: 1,
      row: 1,
      colSpan: 1,
      rowSpan: 1,
      preview: 'clock',
    },
    {
      id: 'w-schedule',
      type: 'schedule',
      title: 'Schedule',
      icon: CalendarDays,
      col: 2,
      row: 1,
      colSpan: 2,
      rowSpan: 1,
      preview: 'schedule',
    },
    {
      id: 'w-lunch',
      type: 'lunch-count',
      title: 'Lunch Count',
      icon: Utensils,
      col: 4,
      row: 1,
      colSpan: 1,
      rowSpan: 1,
      preview: 'lunch',
    },
    {
      id: 'w-timer',
      type: 'timer',
      title: 'Timer',
      icon: Timer,
      col: 1,
      row: 2,
      colSpan: 1,
      rowSpan: 1,
      preview: 'timer',
    },
    {
      id: 'w-randomizer',
      type: 'randomizer',
      title: 'Randomizer',
      icon: Shuffle,
      col: 2,
      row: 2,
      colSpan: 1,
      rowSpan: 1,
      preview: 'randomizer',
    },
    {
      id: 'w-noise',
      type: 'noise',
      title: 'Noise Meter',
      icon: Activity,
      col: 3,
      row: 2,
      colSpan: 1,
      rowSpan: 1,
      preview: 'noise',
    },
    {
      id: 'w-attention',
      type: 'attention',
      title: 'Attention',
      icon: HandMetal,
      col: 4,
      row: 2,
      colSpan: 1,
      rowSpan: 1,
      preview: 'attention',
    },
    {
      id: 'w-notes',
      type: 'notes',
      title: 'Sub Notes',
      icon: Notebook,
      col: 1,
      row: 3,
      colSpan: 2,
      rowSpan: 1,
      preview: 'notes',
    },
    {
      id: 'w-scoreboard',
      type: 'scoreboard',
      title: 'Scoreboard',
      icon: Trophy,
      col: 3,
      row: 3,
      colSpan: 1,
      rowSpan: 1,
      preview: 'scoreboard',
    },
    {
      id: 'w-music',
      type: 'music',
      title: 'Music',
      icon: Music,
      col: 4,
      row: 3,
      colSpan: 1,
      rowSpan: 1,
      preview: 'music',
    },
  ];
}

export const READING_ICON: LucideIcon = BookOpen;
export const SUB_ICON: LucideIcon = GraduationCap;

export function formatExpiresAt(ts: number, now = Date.now()): string {
  const ms = ts - now;
  if (ms <= 0) return 'Expired';
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) {
    const mins = Math.max(1, Math.round(ms / 60000));
    return `Expires in ${mins} min`;
  }
  const d = new Date(ts);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const isTomorrow =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate() + 1;
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (isToday) return `Expires today, ${timeStr}`;
  if (isTomorrow) return `Expires tomorrow, ${timeStr}`;
  return `Expires ${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}, ${timeStr}`;
}
