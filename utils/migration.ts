import {
  Dashboard,
  DrawingConfig,
  WidgetConfig,
  WidgetData,
  WidgetType,
  TextConfig,
  PollConfig,
  PollOption,
} from '@/types';
import { sanitizeHtml } from './security';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { migrateDrawingConfig } from './migrateDrawingConfig';

// Minimum dimension threshold: widgets smaller than this were likely
// created with a bug where pixel dimensions were recorded as single digits
// (e.g. w:5 instead of w:500). 30px is safely below any intentional small
// widget size while catching the broken defaults.
const MIN_WIDGET_DIMENSION_PX = 30;

interface LegacyConfig {
  duration?: number;
}

const fixDimensions = (widget: WidgetData): WidgetData => {
  if (
    widget.w >= MIN_WIDGET_DIMENSION_PX &&
    widget.h >= MIN_WIDGET_DIMENSION_PX
  ) {
    return widget;
  }
  const defaults = WIDGET_DEFAULTS[widget.type];
  const defaultW = defaults?.w ?? 0;
  const defaultH = defaults?.h ?? 0;
  return {
    ...widget,
    w:
      widget.w < MIN_WIDGET_DIMENSION_PX
        ? defaultW >= MIN_WIDGET_DIMENSION_PX
          ? defaultW
          : 300
        : widget.w,
    h:
      widget.h < MIN_WIDGET_DIMENSION_PX
        ? defaultH >= MIN_WIDGET_DIMENSION_PX
          ? defaultH
          : 300
        : widget.h,
  };
};

const applyLegacyRewrites = (widget: WidgetData): WidgetData => {
  // Correct impossibly small dimensions before any other migration so all
  // code paths benefit from the fix (early returns included).
  const w = fixDimensions(widget);
  const type = w.type as string;

  // Sanitize stored text widget content to prevent XSS
  if (type === 'text') {
    const config = w.config as TextConfig;
    if (config.content) {
      return {
        ...w,
        config: {
          ...config,
          content: sanitizeHtml(config.content),
        },
      };
    }
  }

  if (type === 'timer' || type === 'stopwatch') {
    const isTimer = type === 'timer';
    const oldConfig = w.config as LegacyConfig;

    return {
      ...w,
      type: 'time-tool',
      config: {
        mode: isTimer ? 'timer' : 'stopwatch',
        visualType: 'digital',
        duration: isTimer ? (oldConfig.duration ?? 600) : 0,
        elapsedTime: isTimer ? (oldConfig.duration ?? 600) : 0,
        isRunning: false,
        selectedSound: 'Gong',
        themeColor: '#2d3f89', // brand-blue-primary
        glow: false,
        // Prefixed FONTS id — TimeToolWidget.getFontClass() returns this
        // verbatim as a Tailwind class, so a bare 'sans' would be an invalid
        // no-op class; 'font-sans' applies the intended sans font.
        fontFamily: 'font-sans',
        // Legacy 'standard' rendered via the widget's default style branch
        // (no extra classes) — identical to 'modern', which is now the
        // canonical value in the narrowed TimeToolConfig.clockStyle union.
        clockStyle: 'modern',
      },
    };
  }

  if (type === 'workSymbols') {
    return {
      ...w,
      type: 'expectations',
    };
  }

  // Phase 2a + 2.3: migrate legacy drawing configs forward.
  //  - 2.1a wrapped legacy `paths[]` into `objects[]`.
  //  - 2.3 wrapped `objects[]` into `pages[{ id, objects }]`.
  // The widget also does this defensively, but hydrating into the canonical
  // shape avoids spurious Firestore re-writes.
  if (type === 'drawing') {
    const raw = w.config as DrawingConfig;
    const migrated = migrateDrawingConfig(raw);
    // Only replace the config object when a meaningful change occurred to
    // keep React reference equality stable for already-migrated widgets.
    const hadLegacyPaths = Array.isArray(raw?.paths);
    const hadLegacyMode = typeof raw?.mode === 'string';
    const hadLegacyObjects =
      !Array.isArray(raw?.pages) && Array.isArray(raw?.objects);
    const lacksPages = !Array.isArray(raw?.pages) || raw.pages.length === 0;
    if (hadLegacyPaths || hadLegacyMode || hadLegacyObjects || lacksPages) {
      return { ...w, config: migrated };
    }
  }

  // Ensure poll questions/options have stable IDs (legacy data may lack them)
  if (type === 'poll') {
    const pollConfig = w.config as PollConfig;
    const questions = pollConfig.questions;
    if (Array.isArray(questions)) {
      const needsIds = questions.some(
        (q) => !q.id || q.options.some((opt: PollOption) => !opt.id)
      );
      if (needsIds) {
        return {
          ...w,
          config: {
            ...pollConfig,
            questions: questions.map((q) => ({
              ...q,
              id: q.id || crypto.randomUUID(),
              options: q.options.map((opt: PollOption) => ({
                ...opt,
                id: opt.id || crypto.randomUUID(),
              })),
            })),
          },
        };
      }
      return w;
    }
    const options = pollConfig.options ?? [];
    const needsMigration = options.some((opt: PollOption) => !opt.id);
    if (needsMigration) {
      return {
        ...w,
        config: {
          ...pollConfig,
          options: options.map((opt: PollOption) => ({
            ...opt,
            id: opt.id || crypto.randomUUID(),
          })),
        },
      };
    }
  }

  return w;
};

export type ConfigMigrationStep = (config: WidgetConfig) => WidgetConfig;

/** Per-type, per-version config migration steps. Index N runs on configVersion N. */
export const WIDGET_CONFIG_MIGRATIONS: Partial<
  Record<WidgetType, ConfigMigrationStep[]>
> = {};

/** Target `configVersion` for a type — always the step-table length. */
export const targetConfigVersion = (type: WidgetType): number =>
  WIDGET_CONFIG_MIGRATIONS[type]?.length ?? 0;

/** Dual-write step N: copy old -> new, keep old (D25). */
export const renameKeyStep =
  (oldKey: string, newKey: string): ConfigMigrationStep =>
  (config) => {
    const c = config as Record<string, unknown>;
    if (!(oldKey in c) || c[newKey] !== undefined) return config;
    return { ...c, [newKey]: c[oldKey] };
  };

/** Step N+1: re-apply the copy first (self-healing), then drop the old key. */
export const deleteKeyStep =
  (oldKey: string, newKey: string): ConfigMigrationStep =>
  (config) => {
    const c = config as Record<string, unknown>;
    if (!(oldKey in c)) return config;
    const next = { ...c };
    if (next[newKey] === undefined) next[newKey] = next[oldKey];
    delete next[oldKey];
    return next;
  };

export const migrateWidget = (widget: WidgetData): WidgetData => {
  const rewritten = applyLegacyRewrites(widget);
  const target = targetConfigVersion(rewritten.type);
  const from = rewritten.configVersion ?? 0;
  if (rewritten.configVersion === target) return rewritten;
  // A newer bundle already stamped it past this table — leave it alone.
  if (from > target) return rewritten;
  const steps = WIDGET_CONFIG_MIGRATIONS[rewritten.type] ?? [];
  let config = rewritten.config;
  for (let v = from; v < target; v += 1) config = steps[v](config);
  return { ...rewritten, config, configVersion: target };
};

/**
 * Clears `flipped` on all but the highest-`z` flipped widget (first wins on a
 * tie). Board-level, so it cannot live inside the per-widget migrateWidget.
 */
export const normalizeFlipped = (widgets: WidgetData[]): WidgetData[] => {
  const flipped = widgets.filter((w) => w.flipped);
  if (flipped.length <= 1) return widgets;
  let keep = flipped[0];
  for (const w of flipped) if ((w.z ?? 0) > (keep.z ?? 0)) keep = w;
  return widgets.map((w) =>
    w.flipped && w !== keep ? { ...w, flipped: false } : w
  );
};

/** The canonical board-load pipeline: per-widget migration then flip normalization. */
export const migrateBoardWidgets = (widgets: WidgetData[]): WidgetData[] =>
  normalizeFlipped(widgets.map(migrateWidget));

export const migrateLocalStorageToFirestore = async (
  userId: string,
  saveDashboard: (dashboard: Dashboard) => Promise<number | void>
): Promise<number> => {
  const localData = localStorage.getItem('classroom_dashboards');
  if (!localData) return 0;

  try {
    const dashboards = JSON.parse(localData) as Dashboard[];

    await Promise.all(dashboards.map((dashboard) => saveDashboard(dashboard)));

    // Clear localStorage after successful migration
    localStorage.removeItem('classroom_dashboards');

    return dashboards.length;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};
