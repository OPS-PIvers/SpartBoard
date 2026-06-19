// components/plc/sections.ts
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  FileText,
  ListChecks,
  SquareSquare,
  Users2,
  Sparkles,
  Presentation,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { PlcFeatureSettings, getPlcFeatures, type Plc } from '@/types';

/**
 * Canonical PLC section ids — the rail items (PRD §6.1, Decision 4.5).
 *
 * `assessments` is the Wave-4 unification of the former separate `quizzes` +
 * `videoActivities` sections (one library with a quiz / video-activity type
 * filter). The two old ids are NOT in this union — they survive only as
 * router-accepted ALIASES (see `PlcSectionAlias`) so old deep links resolve to
 * `assessments` rather than 404.
 */
export type PlcSectionId =
  | 'home'
  // Meeting Mode (PRD §6.2) — the guided projector surface at
  // `/plc/:id/meeting` (and `/plc/:id/meeting/:meetingId` for a saved record).
  // The second rail item as of Decision 4.5.
  | 'meeting'
  // Unified Assessments library (Decision 4.5, §6.1) — hosts the quiz +
  // video-activity surfaces under one section with a type filter.
  | 'assessments'
  | 'sharedData'
  | 'docs'
  | 'todos'
  | 'sharedBoards'
  | 'members'
  | 'resources'
  | 'settings';

/**
 * Legacy section ids the router still ACCEPTS (so historic deep links don't
 * 404) but which are no longer rail items. Each maps to its canonical
 * replacement via {@link PLC_SECTION_ALIASES}.
 */
export type PlcSectionAlias = 'quizzes' | 'videoActivities';

/** Any section token the router may see in a path (canonical id OR alias). */
export type PlcRouteSection = PlcSectionId | PlcSectionAlias;

/**
 * Alias → canonical-section rewrite table. The pre-Wave-4 `quizzes` and
 * `videoActivities` sections were merged into `assessments`; resolving an
 * alias keeps `/plc/:id/quizzes` and `/plc/:id/videoActivities` deep links
 * working (they land on the Assessments section).
 */
export const PLC_SECTION_ALIASES: Readonly<
  Record<PlcSectionAlias, PlcSectionId>
> = {
  quizzes: 'assessments',
  videoActivities: 'assessments',
};

/**
 * Every section id the router will accept in a `/plc/:plcId/:section` path —
 * the canonical {@link PlcSectionId}s PLUS the legacy {@link PlcSectionAlias}es.
 * Derived from the unions so the three never drift.
 */
export const PLC_ROUTE_SECTIONS: ReadonlySet<PlcRouteSection> =
  new Set<PlcRouteSection>([
    'home',
    'meeting',
    'assessments',
    'sharedData',
    'docs',
    'todos',
    'sharedBoards',
    'members',
    'resources',
    'settings',
    // Aliases (router-accepted, rewritten to a canonical id):
    'quizzes',
    'videoActivities',
  ]);

/** Type guard: is `value` a canonical section id OR a router-accepted alias? */
export function isPlcRouteSection(value: unknown): value is PlcRouteSection {
  return (
    typeof value === 'string' &&
    PLC_ROUTE_SECTIONS.has(value as PlcRouteSection)
  );
}

/**
 * Resolve any router-accepted section token to its canonical {@link
 * PlcSectionId}. Aliases (`quizzes`, `videoActivities`) rewrite to
 * `assessments`; canonical ids pass through unchanged.
 */
export function resolvePlcSection(value: PlcRouteSection): PlcSectionId {
  return (PLC_SECTION_ALIASES as Record<string, PlcSectionId | undefined>)[
    value
  ]
    ? PLC_SECTION_ALIASES[value as PlcSectionAlias]
    : (value as PlcSectionId);
}

export interface PlcSectionDef {
  id: PlcSectionId;
  icon: LucideIcon;
  labelKey: string;
  labelDefault: string;
  /**
   * Predicate gating this section against a PLC's resolved feature settings.
   * Absent = always shown. A predicate (rather than a single flag key) lets
   * `assessments` show when EITHER the quiz OR the video-activity feature is on.
   */
  isEnabled?: (features: PlcFeatureSettings) => boolean;
}

export const PLC_SECTIONS: readonly PlcSectionDef[] = [
  {
    id: 'home',
    icon: LayoutDashboard,
    labelKey: 'plcDashboard.tabs.home',
    labelDefault: 'Home',
  },
  {
    id: 'meeting',
    icon: Presentation,
    labelKey: 'plcDashboard.tabs.meeting',
    labelDefault: 'Meeting Mode',
  },
  {
    id: 'assessments',
    icon: ClipboardList,
    labelKey: 'plcDashboard.tabs.assessments',
    labelDefault: 'Assessments',
    // Shown when EITHER the quiz OR the video-activity feature is enabled, so
    // teams that turn off just one half still get the combined section.
    isEnabled: (features) => features.quizzes || features.videoActivities,
  },
  {
    id: 'sharedData',
    icon: BarChart3,
    labelKey: 'plcDashboard.tabs.sharedData',
    labelDefault: 'Data',
  },
  {
    id: 'docs',
    icon: FileText,
    labelKey: 'plcDashboard.tabs.docs',
    labelDefault: 'Notes & Docs',
    isEnabled: (features) => features.notes,
  },
  {
    id: 'todos',
    icon: ListChecks,
    labelKey: 'plcDashboard.tabs.todos',
    labelDefault: 'To-Dos',
    isEnabled: (features) => features.todos,
  },
  {
    id: 'sharedBoards',
    icon: SquareSquare,
    labelKey: 'plcDashboard.tabs.sharedBoards',
    labelDefault: 'Boards',
    isEnabled: (features) => features.sharedBoards,
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

/**
 * The rail sections visible for a given PLC, in locked loop order, after
 * feature-gating. Centralised here so the dashboard, rail, and tests share one
 * source of truth for visibility + ordering.
 */
export function getVisiblePlcSections(plc: Plc): readonly PlcSectionDef[] {
  const features = getPlcFeatures(plc);
  return PLC_SECTIONS.filter((s) => !s.isEnabled || s.isEnabled(features));
}
