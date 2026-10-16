import React from 'react';
import { Package } from 'lucide-react';
import { getNamedLucideIcon } from '@/utils/lucideIconMap';
import { MaterialDefinition, MaterialsGlobalConfig } from '@/types';

export {
  MATERIAL_ICON_FALLBACK,
  BUILT_IN_MATERIALS,
  getMaterialDefinitions,
  type MaterialsCatalogOptions,
} from './materialsCatalog';
import {
  BUILT_IN_MATERIALS,
  getMaterialDefinitions,
  type MaterialsCatalogOptions,
} from './materialsCatalog';

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

export const resolveMaterialIcon = (iconName?: string): React.ElementType =>
  getNamedLucideIcon(iconName, Package);

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

export const getMaterialsCatalog = (
  config?: Partial<MaterialsGlobalConfig>,
  options?: MaterialsCatalogOptions
): ResolvedMaterialDefinition[] =>
  getMaterialDefinitions(config, options).map(resolveMaterialDefinition);

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
