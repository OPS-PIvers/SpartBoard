import { NeedDoPutThenTile } from '@/types';

export const DEFAULT_NEED_ITEMS: NeedDoPutThenTile[] = [
  { id: 'pencil', label: 'Pencil', icon: 'Pencil', color: '#facc15' },
  { id: 'notebook', label: 'Notebook', icon: 'Notebook', color: '#ef4444' },
  { id: 'chromebook', label: 'Chromebook', icon: 'Laptop', color: '#334155' },
  {
    id: 'headphones',
    label: 'Headphones',
    icon: 'Headphones',
    color: '#ec4899',
  },
  { id: 'paper', label: 'Paper', icon: 'FileText', color: '#e2e8f0' },
];

export const DEFAULT_PUT_ITEMS: NeedDoPutThenTile[] = [
  {
    id: 'schoology',
    label: 'Schoology',
    icon: 'GraduationCap',
    color: '#0ea5e9',
  },
  {
    id: 'google-classroom',
    label: 'Google Classroom',
    icon: 'BookOpen',
    color: '#22c55e',
  },
  { id: 'email', label: 'Email', icon: 'Mail', color: '#7c3aed' },
  { id: 'turn-in-bin', label: 'Turn-in Bin', icon: 'Inbox', color: '#d97706' },
];

export const DEFAULT_DO_ITEMS: string[] = ['', '', ''];

export const DEFAULT_THEN_ITEMS: NeedDoPutThenTile[] = [
  { id: 'read', label: 'Read', icon: 'BookOpen', color: '#8b5cf6' },
  {
    id: 'silent-work',
    label: 'Silent Work',
    icon: 'PenLine',
    color: '#0ea5e9',
  },
  { id: 'partner', label: 'Partner Up', icon: 'Users', color: '#f59e0b' },
];

export const SECTION_TITLES = [
  { plain: 'What you', emphasis: 'need' },
  { plain: 'What you', emphasis: 'do' },
  { plain: 'Where it', emphasis: 'goes' },
  { plain: "What's", emphasis: 'next' },
] as const;

export const SECTION_COLORS = {
  need: '#10b981',
  do: '#2563eb',
  put: '#f59e0b',
  then: '#8b5cf6',
} as const;

export const MIN_LIST_ITEMS = 1;
export const MAX_LIST_ITEMS = 6;
export const MAX_TILE_ITEMS = 12;
