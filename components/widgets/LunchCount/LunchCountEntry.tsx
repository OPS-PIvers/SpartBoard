import React from 'react';
import type { LunchCountConfig, WidgetData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { LunchCountWidget as LegacyLunchCountWidget } from './Widget';
import { LunchCountRedesign } from './redesign/RedesignedLunchCount';
import { isMiddleHighSite } from './redesign/lunchCountFormat';

// The redesign flag applies only to the elementary face; middle/high always renders the legacy widget.
export const LunchCountWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { canAccessFeature } = useAuth();
  const site = (widget.config as LunchCountConfig).schoolSite;
  return canAccessFeature('lunch-count-redesign') && !isMiddleHighSite(site) ? (
    <LunchCountRedesign widget={widget} />
  ) : (
    <LegacyLunchCountWidget widget={widget} />
  );
};
