/**
 * Dashboard PII utilities
 *
 * Widget configs can contain student PII (first/last names, completed name lists,
 * etc.) when teachers use "custom roster" mode. This module provides helpers to:
 *
 *  1. SCRUB  — strip PII fields before writing a dashboard to Firestore
 *  2. EXTRACT — pull PII fields out of a dashboard for Drive storage
 *  3. MERGE  — overlay PII fields from Drive back onto a Firestore-loaded dashboard
 *
 * The Drive supplement file lives at:
 *   SpartBoard/Data/Dashboards/{dashboardId}-pii.json
 * and is a Record<widgetId, Partial<WidgetConfig>> containing only PII fields.
 */

import { Dashboard, LunchCountConfig, WidgetData } from '@/types';
import {
  classLacksSentDetails,
  getCentralDayKey,
  lacksSentDetails,
  mergeSentDetails,
  sentDetailsEntries,
} from '@/components/widgets/LunchCount/redesign/lunchCountFormat';

/** Widget config keys that may contain student PII and must never reach Firestore. */
export const PII_WIDGET_FIELDS = [
  'firstNames', // RandomWidget, ChecklistWidget — newline-delimited name list
  'lastNames', // RandomWidget, ChecklistWidget — newline-delimited name list
  'completedNames', // ChecklistWidget — names/IDs of students who completed items
  'remainingStudents', // RandomWidget — unpicked students in current session
  'lastResult', // RandomWidget — picked name / shuffle / groups (same roster names as remainingStudents)
  'lockedNames', // RandomWidget — manually pinned names (Jigsaw/manual edit)
  'unassignedNames', // RandomWidget — names parked in the Unassigned tray
  'doneNames', // RandomWidget — names marked "done" in Shuffle mode
  'jigsawHomeGroups', // RandomWidget — Jigsaw mode home groups (RandomGroup[] with names[])
  'jigsawExpertGroups', // RandomWidget — Jigsaw mode expert groups (RandomGroup[] with names[])
  'recentGroupings', // RandomWidget — past rounds of group names for avoid recent partners
  'names', // SeatingChartWidget — custom roster name list
  'roster', // LunchCountConfig — student name array
  'customRoster', // StationsConfig — custom-mode roster name list
  'lastSubmittedDetails', // LunchCountConfig — free-text report notes that can name students
] as const;

export type PiiWidgetField =
  | (typeof PII_WIDGET_FIELDS)[number]
  | 'assignments'
  | 'savedPlans'
  | 'teams'
  | 'history';

/** Maps widgetId → object containing only PII fields for that widget */
export type DashboardPiiSupplement = Record<
  string,
  Partial<Record<PiiWidgetField, unknown>>
>;

// Roster student ids are UUIDs (or long opaque ids); anything else is a typed or legacy display name.
const ROSTER_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[\w-]*\d)[\w-]{16,})$/i;
const NAME_KEYED_TYPES = new Set(['stations', 'lunchCount', 'seating-chart']);
// Quiz-built Scoreboard teams are one per student (`pin-<PIN>` / `uid-<uid>` ids, named after them).
const QUIZ_TEAM_ID = /^(?:pin|uid)-/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasNameKeys = (map: unknown): boolean =>
  isRecord(map) && Object.keys(map).some((key) => !ROSTER_ID.test(key));

// Score changes outlive the teams they name, so a quiz team's id can sit in history after the teams are replaced.
const hasQuizTeamHistory = (history: unknown): boolean =>
  Array.isArray(history) &&
  history.some(
    (entry: unknown) =>
      isRecord(entry) &&
      Array.isArray(entry.changes) &&
      entry.changes.some(
        (change: unknown) =>
          isRecord(change) &&
          typeof change.teamId === 'string' &&
          QUIZ_TEAM_ID.test(change.teamId)
      )
  );

/** Config keys of this widget that hold student names and so live only in the Drive supplement. */
export function widgetPiiKeys(
  type: string,
  config: Record<string, unknown>
): PiiWidgetField[] {
  const keys: PiiWidgetField[] = [...PII_WIDGET_FIELDS];
  const custom = config.rosterMode === 'custom';
  if (
    config.assignments !== undefined &&
    (custom || (NAME_KEYED_TYPES.has(type) && hasNameKeys(config.assignments)))
  )
    keys.push('assignments');
  if (
    type === 'seating-chart' &&
    Array.isArray(config.savedPlans) &&
    config.savedPlans.some(
      (plan: unknown) =>
        isRecord(plan) && (custom || hasNameKeys(plan.assignments))
    )
  )
    keys.push('savedPlans');
  if (type === 'scoreboard') {
    if (
      Array.isArray(config.teams) &&
      config.teams.some(
        (team: unknown) =>
          isRecord(team) &&
          typeof team.id === 'string' &&
          QUIZ_TEAM_ID.test(team.id)
      )
    )
      keys.push('teams', 'history');
    else if (hasQuizTeamHistory(config.history)) keys.push('history');
  }
  return keys;
}

// Pre-hidden_words Poll builds stored hidden words as `{questionId}#{word or hash}`; they are dropped, not honoured.
export const isLegacyHiddenWordKey = (key: unknown): boolean =>
  typeof key === 'string' && key.includes('#') && !key.includes(':');

// Lunch notes from an earlier Central-time day are dropped rather than kept in the Drive supplement.
const staleLunchDetails = (config: Record<string, unknown>): boolean =>
  config.lastSubmittedDate !== getCentralDayKey();

// Blank notes the board's synced send record already marks blank need no Drive copy.
const lunchDetailsNeedDrive = (config: Record<string, unknown>): boolean => {
  const sends = (config as LunchCountConfig).lastSubmittedSends;
  return sentDetailsEntries(config.lastSubmittedDetails).some(
    ([key, details]) =>
      details.notes.trim() !== '' || sends?.[key]?.notesBlank !== true
  );
};

const fieldHasPii = (
  field: string,
  config: Record<string, unknown>
): boolean =>
  field === 'lastSubmittedDetails'
    ? lunchDetailsNeedDrive(config)
    : field in config && hasPiiContent(config[field]);

// Empty strings/arrays are widget defaults, not PII — treating them as content made every save abort when Drive was unavailable.
function hasPiiContent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * Returns a deep copy of `dashboard` with all PII fields removed from every
 * widget's config. Safe to write to Firestore.
 */
export function scrubDashboardPII(dashboard: Dashboard): Dashboard {
  return { ...dashboard, widgets: scrubWidgetsPII(dashboard.widgets) };
}

/** Widget-level scrub, for callers holding widgets without a whole dashboard. */
export function scrubWidgetsPII(widgets: WidgetData[]): WidgetData[] {
  return widgets.map((widget) => {
    const config = { ...(widget.config as Record<string, unknown>) };
    const keys = widgetPiiKeys(widget.type, config);
    for (const field of keys) {
      delete config[field];
    }
    // An empty list, not a missing one: a missing list makes the Scoreboard seed Team A/B before Drive restores the teams.
    if (keys.includes('teams')) config.teams = [];
    if (Array.isArray(config.hiddenResponses))
      config.hiddenResponses = config.hiddenResponses.filter(
        (key: unknown) => !isLegacyHiddenWordKey(key)
      );
    return { ...widget, config: config };
  });
}

/**
 * Extracts PII fields from all widgets in `dashboard`.
 * Returns a supplement object suitable for Drive storage.
 * Widgets with no PII fields are omitted.
 */
export function extractDashboardPII(
  dashboard: Dashboard
): DashboardPiiSupplement {
  const supplement: DashboardPiiSupplement = {};

  for (const widget of dashboard.widgets) {
    const config = widget.config as Record<string, unknown>;
    const piiFields: Partial<Record<PiiWidgetField, unknown>> = {};
    let hasPii = false;

    for (const field of widgetPiiKeys(widget.type, config)) {
      if (field === 'lastSubmittedDetails' && staleLunchDetails(config))
        continue;
      if (fieldHasPii(field, config)) {
        piiFields[field] = config[field];
        hasPii = true;
      }
    }

    if (hasPii) {
      supplement[widget.id] = piiFields;
    }
  }

  return supplement;
}

/**
 * Returns a deep copy of `dashboard` with PII fields from `supplement`
 * overlaid onto the corresponding widget configs.
 * Widgets absent from `supplement` are left unchanged.
 */
export function mergeDashboardPII(
  dashboard: Dashboard,
  supplement: DashboardPiiSupplement
): Dashboard {
  return {
    ...dashboard,
    widgets: mergeWidgetsPII(dashboard.widgets, supplement),
  };
}

/** A per-widget set of config fields to lay back over a board. */
export type WidgetConfigOverlay = Record<string, Record<string, unknown>>;

/** Widget-level merge, for callers holding widgets without a whole dashboard. */
export function mergeWidgetsPII(
  widgets: WidgetData[],
  supplement: DashboardPiiSupplement | WidgetConfigOverlay
): WidgetData[] {
  return widgets.map((widget) => {
    const piiFields = supplement[widget.id];
    if (!piiFields || Object.keys(piiFields).length === 0) return widget;
    const config = widget.config as Record<string, unknown>;
    // Lunch notes merge per class: Drive's copy of a class wins, and a class it lacks is kept.
    const lunchDetails =
      'lastSubmittedDetails' in piiFields
        ? {
            lastSubmittedDetails: mergeSentDetails(
              config.lastSubmittedDetails,
              piiFields.lastSubmittedDetails
            ),
          }
        : {};
    return {
      ...widget,
      config: { ...config, ...piiFields, ...lunchDetails },
    };
  });
}

/**
 * Returns true if any widget in `dashboard` holds actual PII content.
 * Empty strings/arrays (widget defaults) do not count.
 */
export function dashboardHasPII(
  dashboard: Dashboard,
  { includeScoreboard = true }: { includeScoreboard?: boolean } = {}
): boolean {
  for (const widget of dashboard.widgets) {
    // Scoreboard teams from a quiz can be sent again, so a board without Drive may still save without them.
    if (!includeScoreboard && widget.type === 'scoreboard') continue;
    const config = widget.config as Record<string, unknown>;
    for (const field of widgetPiiKeys(widget.type, config)) {
      // Lunch report notes are retyped on a resend, so they never block a save without Drive either.
      if (!includeScoreboard && field === 'lastSubmittedDetails') continue;
      if (fieldHasPii(field, config)) return true;
    }
  }
  return false;
}

/** A key for a Lunch Count send whose notes live only in another device's Drive copy, or null when this copy has them. */
export function lunchNotesBehindKey(
  server: WidgetData,
  local: WidgetData | undefined
): string | null {
  if (server.type !== 'lunchCount') return null;
  const config = server.config as LunchCountConfig;
  const localConfig = local?.config as LunchCountConfig | undefined;
  const merged: LunchCountConfig = {
    ...config,
    lastSubmittedDetails: mergeSentDetails(
      localConfig?.lastSubmittedDetails,
      config.lastSubmittedDetails,
      config.lastSubmittedSends
    ),
  };
  if (!lacksSentDetails(merged, server.id)) return null;
  const classes = (config.lastSubmittedClasses ?? [])
    .map((key) => {
      const sentAt = config.lastSubmittedSends?.[key]?.sentAt;
      return sentAt === undefined ? key : `${key}@${sentAt}`;
    })
    .join(',');
  return `${server.id}|${config.lastSubmittedDate ?? ''}|${classes}`;
}

/** One key for the board's sent classes whose notes this copy lacks (class and send time), or null when it lacks none. */
export function lackingLunchNotesKey(dashboard: Dashboard): string | null {
  const keys = dashboard.widgets
    .map((widget) => lunchNotesBehindKey(widget, undefined))
    .filter((key): key is string => key !== null);
  return keys.length > 0 ? keys.join(';') : null;
}

/** True when a Lunch Count on the board lists a sent class whose notes this copy lacks, so a backup must not drop Drive's. */
export function boardLacksLunchNotes(dashboard: Dashboard): boolean {
  return dashboard.widgets.some(
    (widget) =>
      widget.type === 'lunchCount' &&
      lacksSentDetails(widget.config as LunchCountConfig, widget.id)
  );
}

/** Lays Drive's notes back on for each sent class this copy lacks, so writing the backup keeps another device's send. */
export function keepDriveLunchNotes(
  dashboard: Dashboard,
  drivePii: unknown
): Dashboard {
  if (typeof drivePii !== 'object' || drivePii === null) return dashboard;
  const supplement = drivePii as Record<string, unknown>;
  return {
    ...dashboard,
    widgets: dashboard.widgets.map((widget) => {
      if (widget.type !== 'lunchCount') return widget;
      const config = widget.config as LunchCountConfig;
      const entry = supplement[widget.id];
      const fromDrive = sentDetailsEntries(
        typeof entry === 'object' && entry !== null
          ? (entry as Record<string, unknown>).lastSubmittedDetails
          : undefined
      ).filter(([key]) => classLacksSentDetails(config, widget.id, key));
      if (fromDrive.length === 0) return widget;
      return {
        ...widget,
        config: {
          ...config,
          lastSubmittedDetails: {
            ...config.lastSubmittedDetails,
            ...Object.fromEntries(fromDrive),
          },
        },
      };
    }),
  };
}
