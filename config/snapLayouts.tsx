import React from 'react';
import {
  SNAP_ZONE_LAYOUTS,
  type SnapZone,
  type SnapZoneLayout,
} from '@/config/snapZones';
import {
  Columns,
  Grid2x2,
  Sidebar,
  Columns3,
  SquareSplitVertical,
  Layout,
  Grid3X3,
  Rows3,
} from 'lucide-react';

export type { SnapZone };

export interface SnapLayout extends SnapZoneLayout {
  icon: React.ReactNode;
}

const SNAP_LAYOUT_ICONS: Record<string, React.ReactNode> = {
  'split-half': <Columns className="w-5 h-5" />,
  'grid-2x2': <Grid2x2 className="w-5 h-5" />,
  'grid-3x3': <Grid3X3 className="w-5 h-5" />,
  'top-half-bottom-3': <Layout className="w-5 h-5 -rotate-90" />,
  'bottom-half-top-3': <Layout className="w-5 h-5 rotate-90" />,
  'sandwich-3': <Rows3 className="w-5 h-5" />,
  'sidebar-left': <Sidebar className="w-5 h-5" />,
  'sidebar-right': <Sidebar className="w-5 h-5 rotate-180" />,
  'three-columns': <Columns3 className="w-5 h-5" />,
  'split-vertical': <SquareSplitVertical className="w-5 h-5" />,
  'priority-left': <Layout className="w-5 h-5" />,
  'priority-right': <Layout className="w-5 h-5 rotate-180" />,
};

export const SNAP_LAYOUTS: SnapLayout[] = SNAP_ZONE_LAYOUTS.map((layout) => ({
  ...layout,
  icon: SNAP_LAYOUT_ICONS[layout.id],
}));
