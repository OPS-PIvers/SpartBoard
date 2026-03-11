import { Dashboard, WidgetData, TimeToolConfig, TextConfig } from '../types';
import { sanitizeHtml } from './security';

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
