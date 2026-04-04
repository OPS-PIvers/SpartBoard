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
] as const;

export const FONT_COLORS = [
  '#334155',
  '#1e293b',
  '#000000',
  '#ffffff',
  '#2d3f89',
  '#ad2122',
  '#166534',
  '#1e40af',
] as const;
