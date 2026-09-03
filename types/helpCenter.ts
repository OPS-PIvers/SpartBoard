import type { WidgetType } from '@/types';

export interface HelpCategory {
  id: string; // slug, stable
  name: string;
  order: number;
}

export interface HelpCenterConfig {
  categories: HelpCategory[];
  updatedAt: number; // ms epoch int
  updatedBy: string; // uid
}

export const DEFAULT_HELP_CATEGORIES: HelpCategory[] = [
  { id: 'getting-started', name: 'Getting started', order: 0 },
  { id: 'boards-widgets', name: 'Boards & widgets', order: 1 },
  { id: 'quizzes-activities', name: 'Quizzes & activities', order: 2 },
  { id: 'sharing-classes', name: 'Sharing & classes', order: 3 },
  { id: 'admin', name: 'Admin', order: 4 },
];

export type HelpResourceKind = 'embed' | 'guided-learning';
export type HelpEmbedType =
  | 'youtube'
  | 'doc'
  | 'slides'
  | 'sheet'
  | 'pdf'
  | 'drive'
  | 'other';

export interface HelpResourceItem {
  id: string; // == doc id
  kind: HelpResourceKind;
  title: string;
  description: string; // may be ''
  categoryId: string;
  order: number;
  visible: boolean;
  orgId: string | null; // null = global (super admin only)
  widgetTypes: WidgetType[]; // may be []
  url: string | null; // embed only, https
  embedType: HelpEmbedType | null; // embed only, inferred at save
  setId: string | null; // guided-learning only, id in building_guided_learning
  openCount: number;
  createdBy: string; // uid
  createdByEmail: string; // display snapshot
  createdAt: number; // ms epoch int
  updatedAt: number;
}
