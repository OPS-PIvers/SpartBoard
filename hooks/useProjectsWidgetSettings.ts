/** Live view of `admin_settings/projects_widget`; the default (off) stands in until the doc exists. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_PROJECTS_WIDGET_SETTINGS,
  PROJECTS_WIDGET_SETTINGS_DOC,
  normalizeProjectsWidgetSettings,
  type ProjectsWidgetSettings,
} from '@/config/projectsWidget';

export function useProjectsWidgetSettings(
  enabled: boolean = true
): ProjectsWidgetSettings {
  const [settings, setSettings] = useState<ProjectsWidgetSettings>(
    DEFAULT_PROJECTS_WIDGET_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', PROJECTS_WIDGET_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizeProjectsWidgetSettings(snap.data())
            : DEFAULT_PROJECTS_WIDGET_SETTINGS
        ),
      // An unreadable doc must hide the feature, never strand it half-on.
      () => setSettings(DEFAULT_PROJECTS_WIDGET_SETTINGS)
    );
  }, [enabled]);

  return settings;
}
