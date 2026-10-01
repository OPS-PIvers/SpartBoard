import type { ScaleColor } from './gradebookCore';

export interface ScaleColorStyle {
  /** Solid fill for a bar or swatch. */
  bar: string;
  /** Background and text for a heatmap cell or chip. */
  cell: string;
  /** Text colour for a number on white. */
  text: string;
  /** Text colour for a tinted gradebook cell. */
  tint: string;
  /** Fill for SVG marks. */
  hex: string;
}

export const SCALE_COLOR_STYLES: Record<ScaleColor, ScaleColorStyle> = {
  emerald: {
    bar: 'bg-emerald-600',
    cell: 'bg-emerald-100 text-emerald-800',
    text: 'text-emerald-700',
    tint: 'text-emerald-600',
    hex: '#059669',
  },
  teal: {
    bar: 'bg-teal-600',
    cell: 'bg-teal-100 text-teal-800',
    text: 'text-teal-700',
    tint: 'text-teal-600',
    hex: '#0d9488',
  },
  sky: {
    bar: 'bg-sky-600',
    cell: 'bg-sky-100 text-sky-800',
    text: 'text-sky-700',
    tint: 'text-sky-600',
    hex: '#0284c7',
  },
  blue: {
    bar: 'bg-blue-600',
    cell: 'bg-blue-100 text-blue-800',
    text: 'text-blue-700',
    tint: 'text-blue-600',
    hex: '#2563eb',
  },
  amber: {
    bar: 'bg-amber-600',
    cell: 'bg-amber-100 text-amber-800',
    text: 'text-amber-700',
    tint: 'text-amber-600',
    hex: '#d97706',
  },
  orange: {
    bar: 'bg-orange-600',
    cell: 'bg-orange-100 text-orange-800',
    text: 'text-orange-700',
    tint: 'text-orange-600',
    hex: '#ea580c',
  },
  rose: {
    bar: 'bg-brand-red-primary',
    cell: 'bg-rose-100 text-rose-800',
    text: 'text-rose-700',
    tint: 'text-brand-red-primary',
    hex: '#ad2122',
  },
  slate: {
    bar: 'bg-slate-500',
    cell: 'bg-slate-200 text-slate-800',
    text: 'text-slate-600',
    tint: 'text-slate-500',
    hex: '#64748b',
  },
};

export const SCALE_COLOR_LABELS: Record<ScaleColor, string> = {
  emerald: 'Green',
  teal: 'Teal',
  sky: 'Sky',
  blue: 'Blue',
  amber: 'Amber',
  orange: 'Orange',
  rose: 'Red',
  slate: 'Gray',
};
