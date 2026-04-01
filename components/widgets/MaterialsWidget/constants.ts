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
  'Backpack',
  'Book',
  'BookCheck',
  'BookOpen',
  'Bookmark',
  'Briefcase',
  'Calculator',
  'ClipboardList',
  'Folder',
  'GraduationCap',
  'Headphones',
  'Highlighter',
  'Laptop',
  'Library',
  'Notebook',
  'Package',
  'Pencil',
  'PenTool',
  'Printer',
  'Ruler',
  'Scissors',
  'Smartphone',
  'Tablet',
  'Trash2',
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

export const getMaterialsCatalog = (
  config?: Partial<MaterialsGlobalConfig>
): ResolvedMaterialDefinition[] => {
  const merged = new Map<string, MaterialDefinition>();

  BUILT_IN_MATERIALS.forEach((material) => {
    merged.set(material.id, material);
  });

  (config?.customMaterials ?? []).forEach((material) => {
    if (!material?.id || !material.label?.trim()) return;
    merged.set(material.id, material);
  });

  return Array.from(merged.values()).map(resolveMaterialDefinition);
};

export const getMaterialMap = (
  config?: Partial<MaterialsGlobalConfig>
): Map<string, ResolvedMaterialDefinition> =>
  new Map(
    getMaterialsCatalog(config).map((material) => [material.id, material])
  );
