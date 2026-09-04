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

import { Dashboard, WidgetConfig, WidgetData } from '@/types';

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
  'names', // SeatingChartWidget — custom roster name list
  'roster', // LunchCountConfig — student name array
  'customRoster', // StationsConfig — custom-mode roster name list
] as const;

export type PiiWidgetField = (typeof PII_WIDGET_FIELDS)[number] | 'assignments';

/** Maps widgetId → object containing only PII fields for that widget */
export type DashboardPiiSupplement = Record<
  string,
  Partial<Record<PiiWidgetField, unknown>>
>;

// `assignments` is PII only in custom-list mode, where the map keys ARE the typed student names.
function isCustomModeAssignments(config: Record<string, unknown>): boolean {
  return config.rosterMode === 'custom' && config.assignments !== undefined;
}

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
    if (isCustomModeAssignments(config)) {
      delete config.assignments;
    }
    for (const field of PII_WIDGET_FIELDS) {
      delete config[field];
    }
    return { ...widget, config: config as WidgetConfig };
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

    for (const field of PII_WIDGET_FIELDS) {
      if (field in config && hasPiiContent(config[field])) {
        piiFields[field] = config[field];
        hasPii = true;
      }
    }

    if (isCustomModeAssignments(config) && hasPiiContent(config.assignments)) {
      piiFields.assignments = config.assignments;
      hasPii = true;
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
    widgets: dashboard.widgets.map((widget) => {
      const piiFields = supplement[widget.id];
      if (!piiFields || Object.keys(piiFields).length === 0) return widget;
      return {
        ...widget,
        config: {
          ...(widget.config as Record<string, unknown>),
          ...piiFields,
        } as WidgetConfig,
      };
    }),
  };
}

/**
 * Returns true if any widget in `dashboard` holds actual PII content.
 * Empty strings/arrays (widget defaults) do not count.
 */
export function dashboardHasPII(dashboard: Dashboard): boolean {
  for (const widget of dashboard.widgets) {
    const config = widget.config as Record<string, unknown>;
    for (const field of PII_WIDGET_FIELDS) {
      if (field in config && hasPiiContent(config[field])) return true;
    }
    if (isCustomModeAssignments(config) && hasPiiContent(config.assignments))
      return true;
  }
  return false;
}
