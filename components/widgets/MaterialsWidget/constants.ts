import React from 'react';
import * as LucideIcons from 'lucide-react';
import { MaterialDefinition, MaterialsGlobalConfig } from '@/types';

const LUCIDE_ICON_MAP = LucideIcons as unknown as Record<
  string,
  React.ElementType | undefined
>;

export const MATERIAL_ICON_FALLBACK = 'Package';

export const BUILT_IN_MATERIALS: MaterialDefinition[] = [
  {
    id: 'computer',
    label: 'Computer',
    icon: 'Laptop',
    color: '#3b82f6',
    textColor: '#ffffff',
  },
  {
    id: 'chromebook',
    label: 'Chromebook',
    icon: 'Laptop',
    color: '#334155',
    textColor: '#ffffff',
  },
  {
    id: 'pencil',
    label: 'Pencil',
    icon: 'Pencil',
    color: '#facc15',
    textColor: '#0f172a',
  },
  {
    id: 'notebook',
    label: 'Notebook',
    icon: 'Notebook',
    color: '#ef4444',
    textColor: '#ffffff',
  },
  {
    id: 'learn_book',
    label: 'Learn Book',
    icon: 'BookCheck',
    color: '#10b981',
    textColor: '#ffffff',
  },
  {
    id: 'math_journal',
    label: 'Math Journal',
    icon: 'FileText',
    color: '#2563eb',
    textColor: '#ffffff',
  },
  {
    id: 'paper',
    label: 'Paper',
    icon: 'FileText',
    color: '#e2e8f0',
    textColor: '#0f172a',
  },
  {
    id: 'phone',
    label: 'Phone',
    icon: 'Smartphone',
    color: '#6366f1',
    textColor: '#ffffff',
  },
  {
    id: 'textbook',
    label: 'Textbook',
    icon: 'BookOpen',
    color: '#059669',
    textColor: '#ffffff',
  },
  {
    id: 'book_to_read',
    label: 'Book to read',
    icon: 'Bookmark',
    color: '#f43f5e',
    textColor: '#ffffff',
  },
  {
    id: 'ipad',
    label: 'iPad',
    icon: 'Tablet',
    color: '#0ea5e9',
    textColor: '#ffffff',
  },
  {
    id: 'headphones',
    label: 'Headphones',
    icon: 'Headphones',
    color: '#ec4899',
    textColor: '#ffffff',
  },
  {
    id: 'water',
    label: 'Water Bottle',
    icon: 'Droplets',
    color: '#22d3ee',
    textColor: '#0f172a',
  },
  {
    id: 'scissors',
    label: 'Scissors',
    icon: 'Scissors',
    color: '#f97316',
    textColor: '#ffffff',
  },
  {
    id: 'markers',
    label: 'Markers',
    icon: 'Highlighter',
    color: '#a855f7',
    textColor: '#ffffff',
  },
  {
    id: 'calculator',
    label: 'Calculator',
    icon: 'Calculator',
    color: '#4b5563',
    textColor: '#ffffff',
  },
  {
    id: 'book_bin',
    label: 'Book Bin',
    icon: 'Box',
    color: '#d97706',
    textColor: '#ffffff',
  },
];

export const MATERIAL_ICON_OPTIONS = [
  'Apple',
  'Armchair',
  'Atom',
  'Award',
  'Backpack',
  'Beaker',
  'Bike',
  'Blocks',
  'Book',
  'BookCheck',
  'BookMarked',
  'BookOpen',
  'Bookmark',
  'Briefcase',
  'Brush',
  'Calculator',
  'Calendar',
  'Camera',
  'ChefHat',
  'Clipboard',
  'ClipboardCheck',
  'ClipboardList',
  'Clock',
  'Compass',
  'Cpu',
  'Dices',
  'Droplets',
  'Dumbbell',
  'Eraser',
  'FileText',
  'FlaskConical',
  'Folder',
  'Gamepad2',
  'Glasses',
  'Globe',
  'GraduationCap',
  'Guitar',
  'Hammer',
  'Headphones',
  'Highlighter',
  'Keyboard',
  'Languages',
  'Laptop',
  'Library',
  'Lightbulb',
  'Map',
  'Medal',
  'Mic',
  'Microscope',
  'Monitor',
  'Mouse',
  'Music',
  'Newspaper',
  'Notebook',
  'NotebookPen',
  'Package',
  'PaintBucket',
  'Palette',
  'Paperclip',
  'PenTool',
  'Pencil',
  'Printer',
  'Puzzle',
  'Ruler',
  'Scissors',
  'Shapes',
  'Shirt',
  'Sigma',
  'Smartphone',
  'Sparkles',
  'Speaker',
  'StickyNote',
  'Tablet',
  'Target',
  'Telescope',
  'Thermometer',
  'Timer',
  'Trash2',
  'Trophy',
  'Umbrella',
  'UtensilsCrossed',
  'Video',
  'Wallet',
  'Watch',
  'Wrench',
] as const;

export const MATERIAL_COLOR_OPTIONS = [
  '#2563eb',
  '#0f766e',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#db2777',
  '#475569',
  '#0ea5e9',
  '#84cc16',
] as const;

export interface ResolvedMaterialDefinition extends MaterialDefinition {
  iconComponent: React.ElementType;
  textColor: string;
}

let allLucideIconNames: string[] | null = null;

/** Every Lucide export usable as an icon, for the search-all fallback in icon pickers. */
export const getAllLucideIconNames = (): string[] => {
  if (!allLucideIconNames) {
    const ignoredKeys = new Set(['createLucideIcon', 'Icon']);
    allLucideIconNames = Object.keys(LUCIDE_ICON_MAP)
      .filter((name) => /^[A-Z]/.test(name) && !ignoredKeys.has(name))
      .sort((a, b) => a.localeCompare(b));
  }
  return allLucideIconNames;
};

export const resolveMaterialIcon = (iconName?: string): React.ElementType =>
  (iconName ? LUCIDE_ICON_MAP[iconName] : undefined) ??
  LUCIDE_ICON_MAP[MATERIAL_ICON_FALLBACK] ??
  LucideIcons.Package;

export const getContrastingTextColor = (backgroundColor: string): string => {
  const normalized = backgroundColor.trim();
  const match = normalized.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);

  if (!match) {
    return '#ffffff';
  }

  const [, r, g, b] = match;
  const brightness =
    (Number.parseInt(r, 16) * 299 +
      Number.parseInt(g, 16) * 587 +
      Number.parseInt(b, 16) * 114) /
    1000;

  return brightness >= 160 ? '#0f172a' : '#ffffff';
};

export const resolveMaterialDefinition = (
  material: MaterialDefinition
): ResolvedMaterialDefinition => ({
  ...material,
  iconComponent: resolveMaterialIcon(material.icon),
  textColor: material.textColor ?? getContrastingTextColor(material.color),
});

/** Prefix that namespaces teacher-owned materials so they can never shadow a built-in id. */
export const TEACHER_MATERIAL_ID_PREFIX = 'custom_';

export const MAX_TEACHER_MATERIALS = 20;
export const MAX_MATERIAL_LABEL_LENGTH = 24;

export const createTeacherMaterialId = (): string =>
  `${TEACHER_MATERIAL_ID_PREFIX}${crypto.randomUUID()}`;

export const isTeacherMaterialId = (id: string): boolean =>
  id.startsWith(TEACHER_MATERIAL_ID_PREFIX);

const BUILT_IN_MATERIAL_IDS = new Set(
  BUILT_IN_MATERIALS.map((material) => material.id)
);

export const isBuiltInMaterialId = (id: string): boolean =>
  BUILT_IN_MATERIAL_IDS.has(id);

const isUsableMaterial = (material?: MaterialDefinition): boolean =>
  Boolean(material?.id && material.label?.trim());

export interface MaterialsCatalogOptions {
  /** Teacher-owned materials from the user profile. Never filtered by the building allowlist. */
  teacherMaterials?: MaterialDefinition[];
  /** Definitions carried on a widget config so ids absent from this account still resolve. */
  snapshots?: MaterialDefinition[];
  /** Building allowlist. Applies to built-ins and admin customs only. */
  allowedIds?: string[];
}

export const getMaterialsCatalog = (
  config?: Partial<MaterialsGlobalConfig>,
  options?: MaterialsCatalogOptions
): ResolvedMaterialDefinition[] => {
  const merged = new Map<string, MaterialDefinition>();

  BUILT_IN_MATERIALS.forEach((material) => {
    merged.set(material.id, material);
  });

  (config?.customMaterials ?? []).forEach((material) => {
    if (!isUsableMaterial(material)) return;
    merged.set(material.id, material);
  });

  const allowedIds = options?.allowedIds;
  if (allowedIds && allowedIds.length > 0) {
    const allowed = new Set(allowedIds);
    Array.from(merged.keys()).forEach((id) => {
      if (!allowed.has(id)) merged.delete(id);
    });
  }

  // Snapshots only fill gaps — a live definition always wins over a stored copy.
  (options?.snapshots ?? []).forEach((material) => {
    if (!isUsableMaterial(material) || merged.has(material.id)) return;
    merged.set(material.id, material);
  });

  (options?.teacherMaterials ?? []).forEach((material) => {
    if (!isUsableMaterial(material)) return;
    merged.set(material.id, material);
  });

  return Array.from(merged.values()).map(resolveMaterialDefinition);
};

export const getMaterialMap = (
  config?: Partial<MaterialsGlobalConfig>,
  options?: MaterialsCatalogOptions
): Map<string, ResolvedMaterialDefinition> =>
  new Map(
    getMaterialsCatalog(config, options).map((material) => [
      material.id,
      material,
    ])
  );

/** Strips the resolved icon component so a definition is safe to persist to Firestore. */
const toStorableMaterial = (
  material: MaterialDefinition
): MaterialDefinition => ({
  id: material.id,
  label: material.label,
  icon: material.icon,
  color: material.color,
  textColor: material.textColor,
});

/**
 * Builds the snapshot list for a widget: every referenced non-built-in material,
 * resolved from the live catalog so owner edits refresh on the next write.
 */
export const buildMaterialSnapshots = (
  referencedIds: string[],
  catalog: ResolvedMaterialDefinition[]
): MaterialDefinition[] => {
  const byId = new Map(catalog.map((material) => [material.id, material]));
  const seen = new Set<string>();
  const snapshots: MaterialDefinition[] = [];

  referencedIds.forEach((id) => {
    if (isBuiltInMaterialId(id) || seen.has(id)) return;
    const resolved = byId.get(id);
    if (!resolved) return;
    seen.add(id);
    snapshots.push(toStorableMaterial(resolved));
  });

  return snapshots;
};
