import type { LibraryFolderColor } from '@/types';

export interface FolderColorSwatch {
  id: LibraryFolderColor;
  label: string;
  /** Folder icon tint. */
  icon: string;
  /** Picker swatch fill. */
  swatch: string;
  /** Folder row tint (background and border) for the main-pane folder rows. */
  row: string;
}

// Eight colours, no purples (Paul's rule); the order is the picker order.
export const FOLDER_COLORS: readonly FolderColorSwatch[] = [
  {
    id: 'red',
    label: 'Red',
    icon: 'text-red-600',
    swatch: 'bg-red-500',
    row: 'bg-red-50 border-red-200',
  },
  {
    id: 'orange',
    label: 'Orange',
    icon: 'text-orange-600',
    swatch: 'bg-orange-500',
    row: 'bg-orange-50 border-orange-200',
  },
  {
    id: 'amber',
    label: 'Yellow',
    icon: 'text-amber-500',
    swatch: 'bg-amber-400',
    row: 'bg-amber-50 border-amber-200',
  },
  {
    id: 'green',
    label: 'Green',
    icon: 'text-emerald-600',
    swatch: 'bg-emerald-500',
    row: 'bg-emerald-50 border-emerald-200',
  },
  {
    id: 'teal',
    label: 'Teal',
    icon: 'text-teal-600',
    swatch: 'bg-teal-500',
    row: 'bg-teal-50 border-teal-200',
  },
  {
    id: 'blue',
    label: 'Blue',
    icon: 'text-sky-600',
    swatch: 'bg-sky-500',
    row: 'bg-sky-50 border-sky-200',
  },
  {
    id: 'pink',
    label: 'Pink',
    icon: 'text-pink-600',
    swatch: 'bg-pink-500',
    row: 'bg-pink-50 border-pink-200',
  },
  {
    id: 'gray',
    label: 'Gray',
    icon: 'text-slate-500',
    swatch: 'bg-slate-400',
    row: 'bg-slate-50 border-slate-200',
  },
];

export const FOLDER_COLOR_IDS = FOLDER_COLORS.map((c) => c.id);

/** Swatch for a stored colour; unknown or missing values fall back to the neutral default (null). */
export const folderColorSwatch = (
  color: string | null | undefined
): FolderColorSwatch | null =>
  FOLDER_COLORS.find((c) => c.id === color) ?? null;
