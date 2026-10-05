import type { WidgetType } from '../../../types';
import { envelopeSizes } from '../../../config/widgetEnvelopes';
import type { FixtureName, MeasurementSize } from '../types';

export interface HarnessQuery {
  type: string;
  fixture: FixtureName;
  w: number;
  h: number;
  maximized?: boolean;
  selected?: boolean;
  settingsOpen?: boolean;
  count?: 1 | 2;
  state?: 'loading' | 'error' | 'offline' | 'noRoster';
  style?: 'alt';
}

export const harnessUrl = (q: HarnessQuery): string => {
  const params = new URLSearchParams({
    type: q.type,
    fixture: q.fixture,
    w: String(q.w),
    h: String(q.h),
  });
  if (q.maximized) params.set('maximized', '1');
  if (q.selected) params.set('selected', '1');
  if (q.settingsOpen) params.set('settings', 'open');
  if (q.count === 2) params.set('count', '2');
  if (q.state) params.set('state', q.state);
  if (q.style) params.set('style', q.style);
  return `/widget-grader-dev?${params.toString()}`;
};

/** The six plan sizes (R11 test matrix) for one widget. */
export const renderSizes = (type: string): MeasurementSize[] => {
  const e = envelopeSizes(type as WidgetType);
  return [
    { name: 'envelope-min', width: e.min.w, height: e.min.h },
    { name: 'default', width: e.default.w, height: e.default.h },
    { name: 'large-1400x900', width: e.large.w, height: e.large.h },
    {
      name: 'maximized-1920x1080',
      width: e.maximized.w,
      height: e.maximized.h,
    },
    { name: 'widest-aspect', width: e.widest.w, height: e.widest.h },
    { name: 'tallest-aspect', width: e.tallest.w, height: e.tallest.h },
  ];
};

export const windowId = (type: string, instance = 1): string =>
  `grader-${type}-${instance}`;

export const windowSelector = (type: string, instance = 1): string =>
  `[data-draggable-window][data-widget-id="${windowId(type, instance)}"]`;
