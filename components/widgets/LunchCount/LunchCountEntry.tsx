import React from 'react';
import type { LunchCountConfig, WidgetData } from '@/types';
import { MiddleHighLunchCount } from './MiddleHighLunchCount';
import { LunchCountRedesign } from './redesign/RedesignedLunchCount';
import { isMiddleHighSite } from './redesign/lunchCountFormat';

export const LunchCountWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const site = (widget.config as LunchCountConfig).schoolSite;
  return isMiddleHighSite(site) ? (
    <MiddleHighLunchCount widget={widget} />
  ) : (
    <LunchCountRedesign widget={widget} />
  );
};
