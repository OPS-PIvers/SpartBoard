import type { GlobalFontFamily } from '@/types';

export const FONTS = [
  { id: 'global', label: 'Inherit', icon: 'G', className: '' },
  { id: 'font-sans', label: 'Modern', icon: 'Aa', className: 'font-sans' },
  { id: 'font-serif', label: 'Serif', icon: 'Ag', className: 'font-serif' },
  { id: 'font-mono', label: 'Digital', icon: '01', className: 'font-mono' },
  {
    id: 'font-handwritten',
    label: 'School',
    icon: '✏️',
    className: 'font-handwritten',
  },
  { id: 'font-comic', label: 'Comic', icon: '☺', className: 'font-comic' },
  {
    id: 'font-rounded',
    label: 'Rounded',
    icon: '◯',
    className: 'font-rounded',
  },
  { id: 'font-fun', label: 'Fun', icon: '★', className: 'font-fun' },
  { id: 'font-slab', label: 'Slab Serif', icon: 'Sl', className: 'font-slab' },
  { id: 'font-retro', label: 'Retro', icon: '▦', className: 'font-retro' },
  {
    id: 'font-marker',
    label: 'Marker',
    icon: '✍',
    className: 'font-marker',
  },
  {
    id: 'font-cursive',
    label: 'Cursive',
    icon: '𝒞',
    className: 'font-cursive',
  },
] as const;

// Non-`global` GlobalFontFamily entries; each panel renders its own leading `global` option separately.
export const GLOBAL_FONT_FAMILY_OPTIONS: {
  value: GlobalFontFamily;
  label: string;
}[] = [
  { value: 'sans', label: 'Sans Serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'handwritten', label: 'Handwritten' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'comic', label: 'Comic' },
  { value: 'slab', label: 'Slab Serif' },
  { value: 'retro', label: 'Retro' },
  { value: 'fun', label: 'Fun' },
  { value: 'marker', label: 'Marker' },
  { value: 'cursive', label: 'Cursive' },
];

export const FONT_COLORS = [
  '#000000',
  '#374151',
  '#6b7280',
  '#9ca3af',
  '#d1d5db',
  '#ffffff',
  '#991b1b',
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#ca8a04',
  '#65a30d',
  '#166534',
  '#16a34a',
  '#0d9488',
  '#0891b2',
  '#2563eb',
  '#1e40af',
  '#4f46e5',
  '#7c3aed',
  '#9333ea',
  '#c026d3',
  '#db2777',
  '#e11d48',
  '#2d3f89',
  '#ad2122',
  '#78350f',
  '#1c1917',
] as const;
