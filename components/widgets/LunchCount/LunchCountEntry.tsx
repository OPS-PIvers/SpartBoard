import React from 'react';
import type { LunchCountConfig, WidgetData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { LunchCountWidget as LegacyLunchCountWidget } from './Widget';
import { MiddleHighLunchCount } from './MiddleHighLunchCount';
import { LunchCountRedesign } from './redesign/RedesignedLunchCount';
import { isMiddleHighSite } from './redesign/lunchCountFormat';

// The redesign flag applies only to the elementary face; middle/high has its own face.
export const LunchCountWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { canAccessFeature } = useAuth();
  const site = (widget.config as LunchCountConfig).schoolSite;
  if (isMiddleHighSite(site)) return <MiddleHighLunchCount widget={widget} />;
  return canAccessFeature('lunch-count-redesign') ? (
    <LunchCountRedesign widget={widget} />
  ) : (
    <LegacyLunchCountWidget widget={widget} />
  );
};
