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

// 'embed' is retired (H8): rules still accept it, nothing creates or renders it.
export type HelpResourceKind = 'embed' | 'guided-learning';
export type HelpEmbedType =
  'youtube' | 'doc' | 'slides' | 'sheet' | 'pdf' | 'drive' | 'other';

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

/** An item with no category yet; it can't be published until it has one. */
export const UNFILED_CATEGORY_ID = '';

export const isUnfiled = (
  item: Pick<HelpResourceItem, 'categoryId'>
): boolean => item.categoryId === UNFILED_CATEGORY_ID;

/** Every item is in exactly one of these (H15). */
export type HelpItemStatus = 'hidden' | 'published';

export const helpItemStatus = (
  item: Pick<HelpResourceItem, 'visible'>
): HelpItemStatus => (item.visible ? 'published' : 'hidden');

/** What an admin sees an item as: a tour that runs on the real app, or pictures with spots. */
export type HelpItemKind = 'live-tour' | 'picture-guide';

/** Why Publish is refused; shown in place of the button. */
export type HelpPublishRefusal =
  | 'unfiled'
  | 'missing-set'
  | 'web-tour'
  | 'no-steps'
  | 'unchecked-steps'
  | 'failing-steps';

export const HELP_PUBLISH_REFUSAL_TEXT: Record<HelpPublishRefusal, string> = {
  unfiled: 'Pick a category to publish.',
  'missing-set': 'This guide was deleted.',
  'web-tour': 'Web tours publish from the Web tours page.',
  'no-steps': 'Add a step to publish.',
  'unchecked-steps': 'Every step needs a control to publish.',
  'failing-steps': 'Fix the failing steps to publish.',
};
