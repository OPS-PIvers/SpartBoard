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

import { Dashboard, WidgetConfig } from '../types';

/** Widget config keys that may contain student PII and must never reach Firestore. */
export const PII_WIDGET_FIELDS = [
  'firstNames', // RandomWidget, ChecklistWidget — newline-delimited name list
  'lastNames', // RandomWidget, ChecklistWidget — newline-delimited name list
  'completedNames', // ChecklistWidget — names/IDs of students who completed items
  'remainingStudents', // RandomWidget — unpicked students in current session
  'names', // SeatingChartWidget — custom roster name list
  'roster', // LunchCountConfig — student name array
] as const;

export type PiiWidgetField = (typeof PII_WIDGET_FIELDS)[number];

/** Maps widgetId → object containing only PII fields for that widget */
export type DashboardPiiSupplement = Record<
  string,
  Partial<Record<PiiWidgetField, unknown>>
>;

/**
 * Returns a deep copy of `dashboard` with all PII fields removed from every
 * widget's config. Safe to write to Firestore.
 */
export function scrubDashboardPII(dashboard: Dashboard): Dashboard {
  return {
    ...dashboard,
    widgets: dashboard.widgets.map((widget) => {
      const config = { ...(widget.config as Record<string, unknown>) };
      for (const field of PII_WIDGET_FIELDS) {
        delete config[field];
      }
      return { ...widget, config: config as WidgetConfig };
    }),
  };
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
      if (field in config && config[field] !== undefined) {
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
 * Returns true if any widget in `dashboard` has at least one PII field set.
 * Used to decide whether a Drive PII supplement save is needed.
 */
export function dashboardHasPII(dashboard: Dashboard): boolean {
  for (const widget of dashboard.widgets) {
    const config = widget.config as Record<string, unknown>;
    for (const field of PII_WIDGET_FIELDS) {
      if (field in config && config[field] !== undefined) return true;
    }
  }
  return false;
}
