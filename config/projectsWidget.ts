/** Admin-curated `admin_settings/projects_widget` rollout switch for the Projects widget. */

export const PROJECTS_WIDGET_SETTINGS_DOC = 'projects_widget';

export interface ProjectsWidgetSettings {
  /**
   * Group project tracking on the board face, plus the student project page.
   * Ships OFF: the student side depends on ClassLink-sourced rosters
   * (docs/plans/PROJECTS_WIDGET.md §2), so the identity path has to be verified
   * against a real class before any teacher sees it, and flipping it back is
   * the kill switch.
   */
  enabled: boolean;
}

export const DEFAULT_PROJECTS_WIDGET_SETTINGS: ProjectsWidgetSettings = {
  enabled: false,
};

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeProjectsWidgetSettings(
  raw: unknown
): ProjectsWidgetSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_PROJECTS_WIDGET_SETTINGS;
  }
  const enabled = (raw as { enabled?: unknown }).enabled;
  return { enabled: enabled === true };
}
