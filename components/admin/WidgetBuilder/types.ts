/**
 * Types for the admin-facing Widget Builder modal.
 * These are builder/editor-only types (not runtime widget types).
 */

import {
  CustomGridDefinition,
  CustomWidgetDoc,
  CustomWidgetSettingDef,
} from '@/types';

/** The current step in the widget builder wizard */
export type BuilderStep = 'mode' | 'build' | 'settings' | 'preview';

/** State maintained by the wizard */
export interface BuilderState {
  step: BuilderStep;
  mode: 'block' | 'code';
  gridDefinition: CustomGridDefinition;
  codeContent: string;
  meta: WidgetMeta;
  settingsDefs: CustomWidgetSettingDef[];
}

/** Widget metadata filled in Step 3 */
export interface WidgetMeta {
  title: string;
  slug: string;
  description: string;
  icon: string; // lucide key (or legacy emoji)
  color: string; // Tailwind bg-* class
  defaultWidth: number;
  defaultHeight: number;
  buildings: string[];
  accessLevel: 'admin' | 'beta' | 'public';
  betaUsers: string[];
}

/** Props shared by all builder step components */
export interface BuilderStepProps {
  state: BuilderState;
  onChange: (updates: Partial<BuilderState>) => void;
  onNext: () => void;
  onBack: () => void;
}

/** Serialized form of a widget ready to save to Firestore */
export function builderStateToDoc(
  state: BuilderState,
  createdBy: string,
  existingId?: string,
  existingDoc?: Pick<CustomWidgetDoc, 'createdAt' | 'published' | 'enabled'>
): Omit<CustomWidgetDoc, 'id'> & { id?: string } {
  return {
    ...(existingId ? { id: existingId } : {}),
    slug: state.meta.slug,
    title: state.meta.title,
    description: state.meta.description,
    icon: state.meta.icon,
    color: state.meta.color,
    createdBy,
    createdAt: existingDoc?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    mode: state.mode,
    published: existingDoc?.published ?? false,
    buildings: state.meta.buildings,
    gridDefinition: state.mode === 'block' ? state.gridDefinition : undefined,
    codeContent: state.mode === 'code' ? state.codeContent : undefined,
    defaultWidth: state.meta.defaultWidth,
    defaultHeight: state.meta.defaultHeight,
    settings: state.settingsDefs,
    accessLevel: state.meta.accessLevel,
    betaUsers: state.meta.betaUsers,
    enabled: existingDoc?.enabled ?? true,
  };
}

/** Color presets for the widget color picker */
export const WIDGET_COLOR_PRESETS = [
  { label: 'Blue', value: 'bg-blue-500' },
  { label: 'Indigo', value: 'bg-indigo-600' },
  { label: 'Purple', value: 'bg-purple-500' },
  { label: 'Pink', value: 'bg-pink-500' },
  { label: 'Red', value: 'bg-red-500' },
  { label: 'Orange', value: 'bg-orange-500' },
  { label: 'Amber', value: 'bg-amber-500' },
  { label: 'Yellow', value: 'bg-yellow-400' },
  { label: 'Green', value: 'bg-green-500' },
  { label: 'Emerald', value: 'bg-emerald-500' },
  { label: 'Teal', value: 'bg-teal-500' },
  { label: 'Slate', value: 'bg-slate-700' },
];
