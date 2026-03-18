import { Dashboard, WidgetData, TimeToolConfig, TextConfig } from '../types';
import { sanitizeHtml } from './security';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';

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

export const migrateWidget = (widget: WidgetData): WidgetData => {
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
        } as TextConfig,
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
        fontFamily: 'sans',
        clockStyle: 'standard',
      } as TimeToolConfig,
    };
  }

  if (type === 'workSymbols') {
    return {
      ...w,
      type: 'expectations',
    };
  }

  return w;
};

export const migrateLocalStorageToFirestore = async (
  userId: string,
  saveDashboard: (dashboard: Dashboard) => Promise<number | void>
): Promise<number> => {
  const localData = localStorage.getItem('classroom_dashboards');
  if (!localData) return 0;

  try {
    const dashboards = JSON.parse(localData) as Dashboard[];

    for (const dashboard of dashboards) {
      await saveDashboard(dashboard);
    }

    // Clear localStorage after successful migration
    localStorage.removeItem('classroom_dashboards');

    return dashboards.length;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};
