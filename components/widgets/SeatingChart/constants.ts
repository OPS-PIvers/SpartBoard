import type { ElementType } from 'react';
import { FurnitureItem, SeatingChartTemplate } from '@/types';
import {
  Armchair,
  LayoutGrid,
  Monitor,
  User,
  Rows3,
  Grip,
  LayoutTemplate,
} from 'lucide-react';

// Furniture definitions for palette
export const FURNITURE_TYPES: {
  type: FurnitureItem['type'];
  label: string;
  w: number;
  h: number;
  icon: ElementType;
}[] = [
  { type: 'desk', label: 'Desk', w: 80, h: 65, icon: Monitor },
  {
    type: 'table-rect',
    label: 'Table (Rect)',
    w: 120,
    h: 80,
    icon: LayoutGrid,
  },
  {
    type: 'table-round',
    label: 'Table (Round)',
    w: 100,
    h: 100,
    icon: LayoutGrid,
  },
  { type: 'rug', label: 'Rug', w: 150, h: 100, icon: Armchair },
  { type: 'teacher-desk', label: 'Teacher', w: 100, h: 60, icon: User },
];

// UI chrome sizes — must match the Tailwind classes used in the layout
// (w-48 sidebar = 192px, h-12 toolbar = 48px). Named here so a future
// layout change only requires updating one place.
export const SETUP_SIDEBAR_W = 192;
export const TOOLBAR_H = 48;
// Minimum safe canvas dimension to avoid zero/negative spacing in generators
export const MIN_CANVAS_DIM = 200;

// Template metadata for UI
export const TEMPLATES: {
  id: SeatingChartTemplate;
  label: string;
  icon: ElementType;
  description: string;
}[] = [
  {
    id: 'freeform',
    label: 'Freeform',
    icon: LayoutTemplate,
    description: 'Place desks freely',
  },
  {
    id: 'rows',
    label: 'Rows',
    icon: Rows3,
    description: 'Evenly spaced rows',
  },
  {
    id: 'horseshoe',
    label: 'Horseshoe',
    icon: Armchair,
    description: 'Inner & outer U',
  },
  {
    id: 'pods',
    label: 'Pods',
    icon: Grip,
    description: 'Groups of 4',
  },
];

export const EMPTY_ARRAY: { id: string; label: string }[] = [];
