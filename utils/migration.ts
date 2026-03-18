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

export const migrateWidget = (widget: WidgetData): WidgetData => {
  const type = widget.type as string;

  // Sanitize stored text widget content to prevent XSS
  if (type === 'text') {
    const config = widget.config as TextConfig;
    if (config.content) {
      return {
        ...widget,
        config: {
          ...config,
          content: sanitizeHtml(config.content),
        } as TextConfig,
      };
    }
  }

  if (type === 'timer' || type === 'stopwatch') {
    const isTimer = type === 'timer';
    const oldConfig = widget.config as LegacyConfig;

    return {
      ...widget,
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
      ...widget,
      type: 'expectations',
    };
  }

  // Correct widgets saved with impossibly small dimensions (caused by a bug
  // where the default w/h were single-digit numbers instead of pixel values).
  if (widget.w < MIN_WIDGET_DIMENSION_PX || widget.h < MIN_WIDGET_DIMENSION_PX) {
    const defaults = WIDGET_DEFAULTS[widget.type as keyof typeof WIDGET_DEFAULTS];
    return {
      ...widget,
      w:
        widget.w < MIN_WIDGET_DIMENSION_PX
          ? defaults?.w && defaults.w >= MIN_WIDGET_DIMENSION_PX
            ? defaults.w
            : 300
          : widget.w,
      h:
        widget.h < MIN_WIDGET_DIMENSION_PX
          ? defaults?.h && defaults.h >= MIN_WIDGET_DIMENSION_PX
            ? defaults.h
            : 300
          : widget.h,
    };
  }

  return widget;
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
