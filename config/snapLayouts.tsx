import React from 'react';
import {
  Columns,
  Grid2x2,
  Sidebar,
  Columns3,
  SquareSplitVertical,
  Layout,
  Grid3X3,
  Rows3,
  PanelTop,
  PanelLeft,
  SquareSplitHorizontal,
} from 'lucide-react';

export interface SnapZone {
  id: string;
  x: number; // 0.0 to 1.0 (Percentage of safe width)
  y: number; // 0.0 to 1.0 (Percentage of safe height)
  w: number; // 0.0 to 1.0 (Percentage of safe width)
  h: number; // 0.0 to 1.0 (Percentage of safe height)
}

export interface SnapLayout {
  id: string;
  nameKey: string;
  icon: React.ReactNode;
  zones: SnapZone[];
}

export const SNAP_LAYOUTS: SnapLayout[] = [
  {
    id: 'split-half',
    nameKey: 'splitScreen',
    icon: <Columns className="w-5 h-5" />,
    zones: [
      { id: 'left-half', x: 0, y: 0, w: 0.5, h: 1 },
      { id: 'right-half', x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    id: 'grid-2x2',
    nameKey: 'fourGrid',
    icon: <Grid2x2 className="w-5 h-5" />,
    zones: [
      { id: 'top-left', x: 0, y: 0, w: 0.5, h: 0.5 },
      { id: 'top-right', x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { id: 'bottom-left', x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { id: 'bottom-right', x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'grid-3x3',
    nameKey: 'nineGrid',
    icon: <Grid3X3 className="w-5 h-5" />,
    zones: [
      { id: 'r1-c1', x: 0, y: 0, w: 0.33, h: 0.33 },
      { id: 'r1-c2', x: 0.33, y: 0, w: 0.34, h: 0.33 },
      { id: 'r1-c3', x: 0.67, y: 0, w: 0.33, h: 0.33 },
      { id: 'r2-c1', x: 0, y: 0.33, w: 0.33, h: 0.34 },
      { id: 'r2-c2', x: 0.33, y: 0.33, w: 0.34, h: 0.34 },
      { id: 'r2-c3', x: 0.67, y: 0.33, w: 0.33, h: 0.34 },
      { id: 'r3-c1', x: 0, y: 0.67, w: 0.33, h: 0.33 },
      { id: 'r3-c2', x: 0.33, y: 0.67, w: 0.34, h: 0.33 },
      { id: 'r3-c3', x: 0.67, y: 0.67, w: 0.33, h: 0.33 },
    ],
  },
  {
    id: 'top-half-bottom-3',
    nameKey: 'topPriority3',
    icon: <Layout className="w-5 h-5 -rotate-90" />,
    zones: [
      { id: 'top-half', x: 0, y: 0, w: 1, h: 0.5 },
      { id: 'bottom-1', x: 0, y: 0.5, w: 0.33, h: 0.5 },
      { id: 'bottom-2', x: 0.33, y: 0.5, w: 0.34, h: 0.5 },
      { id: 'bottom-3', x: 0.67, y: 0.5, w: 0.33, h: 0.5 },
    ],
  },
  {
    id: 'bottom-half-top-3',
    nameKey: 'bottomPriority3',
    icon: <Layout className="w-5 h-5 rotate-90" />,
    zones: [
      { id: 'top-1', x: 0, y: 0, w: 0.33, h: 0.5 },
      { id: 'top-2', x: 0.33, y: 0, w: 0.34, h: 0.5 },
      { id: 'top-3', x: 0.67, y: 0, w: 0.33, h: 0.5 },
      { id: 'bottom-half', x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: 'sandwich-3',
    nameKey: 'middlePriority3',
    icon: <Rows3 className="w-5 h-5" />,
    zones: [
      { id: 'top-1', x: 0, y: 0, w: 0.33, h: 0.33 },
      { id: 'top-2', x: 0.33, y: 0, w: 0.34, h: 0.33 },
      { id: 'top-3', x: 0.67, y: 0, w: 0.33, h: 0.33 },
      { id: 'middle-wide', x: 0, y: 0.33, w: 1, h: 0.34 },
      { id: 'bottom-1', x: 0, y: 0.67, w: 0.33, h: 0.33 },
      { id: 'bottom-2', x: 0.33, y: 0.67, w: 0.34, h: 0.33 },
      { id: 'bottom-3', x: 0.67, y: 0.67, w: 0.33, h: 0.33 },
    ],
  },
  {
    id: 'sidebar-left',
    nameKey: 'sidebarLeft',
    icon: <Sidebar className="w-5 h-5" />,
    zones: [
      { id: 'side', x: 0, y: 0, w: 0.34, h: 1 },
      { id: 'main', x: 0.34, y: 0, w: 0.66, h: 1 },
    ],
  },
  {
    id: 'sidebar-right',
    nameKey: 'sidebarRight',
    icon: <Sidebar className="w-5 h-5 rotate-180" />,
    zones: [
      { id: 'main', x: 0, y: 0, w: 0.66, h: 1 },
      { id: 'side', x: 0.66, y: 0, w: 0.34, h: 1 },
    ],
  },
  {
    id: 'three-columns',
    nameKey: 'threeColumns',
    icon: <Columns3 className="w-5 h-5" />,
    zones: [
      { id: 'left', x: 0, y: 0, w: 0.33, h: 1 },
      { id: 'center', x: 0.33, y: 0, w: 0.34, h: 1 },
      { id: 'right', x: 0.67, y: 0, w: 0.33, h: 1 },
    ],
  },
  {
    id: 'split-vertical',
    nameKey: 'topBottom',
    icon: <SquareSplitVertical className="w-5 h-5" />,
    zones: [
      { id: 'top', x: 0, y: 0, w: 1, h: 0.5 },
      { id: 'bottom', x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: 'three-rows',
    nameKey: 'threeRows',
    icon: <Rows3 className="w-5 h-5" />,
    zones: [
      { id: 'row-1', x: 0, y: 0, w: 1, h: 0.33 },
      { id: 'row-2', x: 0, y: 0.33, w: 1, h: 0.34 },
      { id: 'row-3', x: 0, y: 0.67, w: 1, h: 0.33 },
    ],
  },
  {
    id: 'priority-left',
    nameKey: 'priorityLeft',
    icon: <Layout className="w-5 h-5" />,
    zones: [
      { id: 'main', x: 0, y: 0, w: 0.5, h: 1 },
      { id: 'top-side', x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { id: 'bottom-side', x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'priority-right',
    nameKey: 'priorityRight',
    icon: <Layout className="w-5 h-5 rotate-180" />,
    zones: [
      { id: 'top-side', x: 0, y: 0, w: 0.5, h: 0.5 },
      { id: 'bottom-side', x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { id: 'main', x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    id: 'top-utility-bar',
    nameKey: 'topUtilityBar',
    icon: <PanelTop className="w-5 h-5" />,
    zones: [
      { id: 'top-1', x: 0, y: 0, w: 0.125, h: 0.15 },
      { id: 'top-2', x: 0.125, y: 0, w: 0.125, h: 0.15 },
      { id: 'top-3', x: 0.25, y: 0, w: 0.125, h: 0.15 },
      { id: 'top-4', x: 0.375, y: 0, w: 0.125, h: 0.15 },
      { id: 'top-5', x: 0.5, y: 0, w: 0.125, h: 0.15 },
      { id: 'top-6', x: 0.625, y: 0, w: 0.125, h: 0.15 },
      { id: 'top-7', x: 0.75, y: 0, w: 0.125, h: 0.15 },
      { id: 'top-8', x: 0.875, y: 0, w: 0.125, h: 0.15 },
    ],
  },
  {
    id: 'sidebar-utility',
    nameKey: 'sidebarUtility',
    icon: <PanelLeft className="w-5 h-5" />,
    zones: [{ id: 'sidebar', x: 0, y: 0, w: 0.2, h: 1 }],
  },
  {
    id: 'double-sidebar-utility',
    nameKey: 'doubleSidebarUtility',
    icon: <SquareSplitHorizontal className="w-5 h-5 rotate-90" />,
    zones: [
      { id: 'sidebar-top', x: 0, y: 0, w: 0.2, h: 0.5 },
      { id: 'sidebar-bottom', x: 0, y: 0.5, w: 0.2, h: 0.5 },
    ],
  },
];
