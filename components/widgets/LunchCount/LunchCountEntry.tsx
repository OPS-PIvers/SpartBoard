import React from 'react';
import type { WidgetData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { LunchCountWidget as LegacyLunchCountWidget } from './Widget';
import { LunchCountRedesign } from './redesign/RedesignedLunchCount';

// The lunch-count-redesign flag picks the face; off renders the legacy face untouched.
export const LunchCountWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { canAccessFeature } = useAuth();
  return canAccessFeature('lunch-count-redesign') ? (
    <LunchCountRedesign widget={widget} />
  ) : (
    <LegacyLunchCountWidget widget={widget} />
  );
};
