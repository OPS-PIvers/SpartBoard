import { MaterialDefinition, MaterialsGlobalConfig } from '@/types';

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

export const getMaterialDefinitions = (
  config?: Partial<MaterialsGlobalConfig>,
  options?: MaterialsCatalogOptions
): MaterialDefinition[] => {
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

  return Array.from(merged.values());
};
