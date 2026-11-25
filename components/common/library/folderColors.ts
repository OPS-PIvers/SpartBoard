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
  /** Hex of the icon tint, stored on board collections. */
  hex: string;
}

// Eight colours, no purples (Paul's rule); the order is the picker order.
export const FOLDER_COLORS: readonly FolderColorSwatch[] = [
  {
    id: 'red',
    hex: '#dc2626',
    label: 'Red',
    icon: 'text-red-600',
    swatch: 'bg-red-500',
    row: 'bg-red-50 border-red-200',
  },
  {
    id: 'orange',
    hex: '#ea580c',
    label: 'Orange',
    icon: 'text-orange-600',
    swatch: 'bg-orange-500',
    row: 'bg-orange-50 border-orange-200',
  },
  {
    id: 'amber',
    hex: '#f59e0b',
    label: 'Yellow',
    icon: 'text-amber-500',
    swatch: 'bg-amber-400',
    row: 'bg-amber-50 border-amber-200',
  },
  {
    id: 'green',
    hex: '#059669',
    label: 'Green',
    icon: 'text-emerald-600',
    swatch: 'bg-emerald-500',
    row: 'bg-emerald-50 border-emerald-200',
  },
  {
    id: 'teal',
    hex: '#0d9488',
    label: 'Teal',
    icon: 'text-teal-600',
    swatch: 'bg-teal-500',
    row: 'bg-teal-50 border-teal-200',
  },
  {
    id: 'blue',
    hex: '#0284c7',
    label: 'Blue',
    icon: 'text-sky-600',
    swatch: 'bg-sky-500',
    row: 'bg-sky-50 border-sky-200',
  },
  {
    id: 'pink',
    hex: '#db2777',
    label: 'Pink',
    icon: 'text-pink-600',
    swatch: 'bg-pink-500',
    row: 'bg-pink-50 border-pink-200',
  },
  {
    id: 'gray',
    hex: '#64748b',
    label: 'Gray',
    icon: 'text-slate-500',
    swatch: 'bg-slate-400',
    row: 'bg-slate-50 border-slate-200',
  },
];

export const FOLDER_COLOR_IDS = FOLDER_COLORS.map((c) => c.id);

// Board collections stored any hex before they shared this palette; known picks map by hand (violet has no purple to go to).
const LEGACY_HEX: Readonly<Record<string, LibraryFolderColor>> = {
  '#2d3f89': 'blue',
  '#ad2122': 'red',
  '#d97706': 'amber',
  '#7c3aed': 'blue',
  '#475569': 'gray',
};

const HUE_ORDER: readonly [number, LibraryFolderColor][] = [
  [0, 'red'],
  [25, 'orange'],
  [45, 'amber'],
  [150, 'green'],
  [178, 'teal'],
  [205, 'blue'],
  [260, 'blue'],
  [330, 'pink'],
  [360, 'red'],
];

/** Nearest palette colour for any hex: low-saturation greys go to gray, the rest by hue. */
const nearestByHue = (hex: string): LibraryFolderColor | null => {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (max === 0 || d / max < 0.2) return 'gray';
  let hue =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  let best: LibraryFolderColor = 'red';
  let bestGap = Infinity;
  for (const [anchor, id] of HUE_ORDER) {
    const gap = Math.abs(hue - anchor);
    if (gap < bestGap) {
      bestGap = gap;
      best = id;
    }
  }
  return best;
};

/** Swatch for a stored colour (a palette id, or a collection's hex); unknown or missing values fall back to the neutral default (null). */
export const folderColorSwatch = (
  color: string | null | undefined
): FolderColorSwatch | null => {
  if (!color) return null;
  const byId = FOLDER_COLORS.find((c) => c.id === color);
  if (byId) return byId;
  const lower = color.trim().toLowerCase();
  const id =
    FOLDER_COLORS.find((c) => c.hex === lower)?.id ??
    LEGACY_HEX[lower] ??
    nearestByHue(lower);
  return FOLDER_COLORS.find((c) => c.id === id) ?? null;
};

/** A collection's stored colour as the palette hex it shows as, or undefined for none. */
export const collectionPaletteHex = (
  color: string | null | undefined
): string | undefined => folderColorSwatch(color)?.hex;
