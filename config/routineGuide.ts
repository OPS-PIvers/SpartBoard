import {
  GradeLevel,
  RoutineGuideCategory,
  RoutineGuideGlobalConfig,
  RoutineGuideInfo,
  RoutineGuideRoutine,
  WidgetType,
} from '@/types';
import {
  InstructionalRoutine,
  ROUTINES as INSTRUCTIONAL_ROUTINES,
} from '@/config/instructionalRoutines';

export interface RoutineGuideColor {
  id: string;
  label: string;
  tint: string;
  ink: string;
}

// No purples: legacy indigo/violet/purple/fuchsia steps fold into blue.
export const ROUTINE_GUIDE_COLORS: RoutineGuideColor[] = [
  { id: 'blue', label: 'Blue', tint: '#dbeafe', ink: '#1d4ed8' },
  { id: 'sky', label: 'Sky', tint: '#e0f2fe', ink: '#0369a1' },
  { id: 'teal', label: 'Teal', tint: '#ccfbf1', ink: '#0f766e' },
  { id: 'green', label: 'Green', tint: '#dcfce7', ink: '#15803d' },
  { id: 'amber', label: 'Amber', tint: '#fef3c7', ink: '#b45309' },
  { id: 'orange', label: 'Orange', tint: '#ffedd5', ink: '#c2410c' },
  { id: 'red', label: 'Red', tint: '#fee2e2', ink: '#b91c1c' },
  { id: 'rose', label: 'Rose', tint: '#ffe4e6', ink: '#be123c' },
  { id: 'slate', label: 'Slate', tint: '#f1f5f9', ink: '#334155' },
];

const COLOR_ALIASES: Record<string, string> = {
  indigo: 'blue',
  violet: 'blue',
  purple: 'blue',
  fuchsia: 'rose',
  pink: 'rose',
  cyan: 'sky',
  emerald: 'green',
  lime: 'green',
  yellow: 'amber',
  zinc: 'slate',
  stone: 'slate',
  gray: 'slate',
};

export const getRoutineGuideColor = (id?: string): RoutineGuideColor => {
  const key = id ? (COLOR_ALIASES[id] ?? id) : 'blue';
  return (
    ROUTINE_GUIDE_COLORS.find((c) => c.id === key) ?? ROUTINE_GUIDE_COLORS[0]
  );
};

export const ROUTINE_GUIDE_GRADE_LEVELS: GradeLevel[] = [
  'k-2',
  '3-5',
  '6-8',
  '9-12',
];

export const DEFAULT_ROUTINE_GUIDE_CATEGORIES: RoutineGuideCategory[] = [
  { id: 'general-literacy', label: 'General literacy' },
  { id: 'disciplinary-literacy', label: 'Disciplinary literacy' },
];

const isElementaryOnly = (levels: GradeLevel[] | undefined): boolean =>
  !!levels?.length && levels.every((l) => l === 'k-2' || l === '3-5');

/** Converts an Instructional Routines entry, keeping step images and dropping stickers. */
export const toRoutineGuideRoutine = (
  r: InstructionalRoutine
): RoutineGuideRoutine => ({
  id: r.id,
  name: r.name,
  gradeLevels: r.gradeLevels?.length ? r.gradeLevels : [],
  categoryIds: isElementaryOnly(r.gradeLevels) ? ['general-literacy'] : [],
  icon: r.icon,
  color: getRoutineGuideColor(r.color).id,
  steps: r.steps.map((s, i) => ({
    id: `${r.id}-${i}`,
    text: s.text,
    ...(s.label ? { label: s.label } : {}),
    ...(s.icon ? { icon: s.icon } : {}),
    color: getRoutineGuideColor(s.color).id,
    ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
    ...(s.attachedWidget
      ? {
          attachedWidget: {
            type: s.attachedWidget.type as WidgetType,
            label: s.attachedWidget.label,
            ...(s.attachedWidget.config
              ? { config: s.attachedWidget.config }
              : {}),
          },
        }
      : {}),
  })),
});

export const BUILT_IN_ROUTINE_GUIDE_ROUTINES: RoutineGuideRoutine[] =
  INSTRUCTIONAL_ROUTINES.map(toRoutineGuideRoutine);

/** The admin-saved library, or the built-in one until an admin saves. */
export const resolveRoutineGuideLibrary = (
  config: RoutineGuideGlobalConfig | undefined
): RoutineGuideRoutine[] =>
  Array.isArray(config?.routines)
    ? config.routines.map((r) => ({ ...r, categoryIds: r.categoryIds ?? [] }))
    : BUILT_IN_ROUTINE_GUIDE_ROUTINES;

export const resolveRoutineGuideCategories = (
  config: RoutineGuideGlobalConfig | undefined
): RoutineGuideCategory[] =>
  Array.isArray(config?.categories)
    ? config.categories
    : DEFAULT_ROUTINE_GUIDE_CATEGORIES;

/** Seeds the admin library from the built-ins plus any routines admins added to the Routines widget. */
export const seedRoutineGuideLibrary = (
  instructionalRoutines: InstructionalRoutine[]
): RoutineGuideRoutine[] => {
  const byId = new Map<string, RoutineGuideRoutine>();
  INSTRUCTIONAL_ROUTINES.forEach((r) =>
    byId.set(r.id, toRoutineGuideRoutine(r))
  );
  instructionalRoutines.forEach((r) =>
    byId.set(r.id, toRoutineGuideRoutine(r))
  );
  return Array.from(byId.values());
};

/** Favorites first, then A to Z. */
export const sortRoutinesForLibrary = (
  routines: RoutineGuideRoutine[],
  favorites: string[]
): RoutineGuideRoutine[] =>
  [...routines].sort((a, b) => {
    const fa = favorites.includes(a.id) ? 0 : 1;
    const fb = favorites.includes(b.id) ? 0 : 1;
    return fa - fb || a.name.localeCompare(b.name);
  });

export const sortRoutinesByName = (
  routines: RoutineGuideRoutine[]
): RoutineGuideRoutine[] =>
  [...routines].sort((a, b) => a.name.localeCompare(b.name));

export const ROUTINE_GUIDE_INFO_FIELDS: {
  key: keyof RoutineGuideInfo;
  label: string;
}[] = [
  { key: 'what', label: 'What it is' },
  { key: 'why', label: 'Why' },
  { key: 'coreComponents', label: 'Core components' },
];

export const hasRoutineInfo = (r: RoutineGuideRoutine): boolean =>
  ROUTINE_GUIDE_INFO_FIELDS.some((f) => !!r.info?.[f.key]?.trim());
