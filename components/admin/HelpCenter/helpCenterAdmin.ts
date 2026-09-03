import type { HelpCategory, HelpResourceItem } from '@/types/helpCenter';
import type { User } from 'firebase/auth';

export const HELP_RESOURCES_COLLECTION = 'help_resources';

export interface HelpItemDraft {
  kind: HelpResourceItem['kind'];
  title: string;
  description: string;
  categoryId: string;
  widgetTypes: HelpResourceItem['widgetTypes'];
  visible: boolean;
  url: string | null;
  embedType: HelpResourceItem['embedType'];
  setId: string | null;
}

// Field list must match the rules `hasOnly` allowlist exactly.
export const buildHelpItemCreatePayload = (
  draft: HelpItemDraft,
  opts: {
    orgId: string | null;
    user: Pick<User, 'uid' | 'email'>;
    order: number;
  }
): Record<string, unknown> => ({
  kind: draft.kind,
  title: draft.title.trim(),
  description: draft.description.trim(),
  categoryId: draft.categoryId,
  order: opts.order,
  visible: draft.visible,
  orgId: opts.orgId,
  widgetTypes: draft.widgetTypes,
  url: draft.kind === 'embed' ? draft.url : null,
  embedType: draft.kind === 'embed' ? draft.embedType : null,
  setId: draft.kind === 'guided-learning' ? draft.setId : null,
  openCount: 0,
  createdBy: opts.user.uid,
  createdByEmail: opts.user.email ?? '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// Updates never carry openCount, orgId or createdBy — the rules reject those.
export const buildHelpItemUpdatePayload = (
  draft: HelpItemDraft
): Record<string, unknown> => ({
  kind: draft.kind,
  title: draft.title.trim(),
  description: draft.description.trim(),
  categoryId: draft.categoryId,
  visible: draft.visible,
  widgetTypes: draft.widgetTypes,
  url: draft.kind === 'embed' ? draft.url : null,
  embedType: draft.kind === 'embed' ? draft.embedType : null,
  setId: draft.kind === 'guided-learning' ? draft.setId : null,
  updatedAt: Date.now(),
});

export const nextOrderInCategory = (
  items: HelpResourceItem[],
  categoryId: string
): number =>
  items
    .filter((item) => item.categoryId === categoryId)
    .reduce((max, item) => Math.max(max, item.order + 1), 0);

export const sortCategories = (categories: HelpCategory[]): HelpCategory[] =>
  [...categories].sort((a, b) => a.order - b.order);

export const slugifyCategoryName = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `category-${Date.now()}`;

export const buildVisibilityPayload = (
  visible: boolean
): Record<string, unknown> => ({ visible, updatedAt: Date.now() });

export const buildOrderPayload = (order: number): Record<string, unknown> => ({
  order,
  updatedAt: Date.now(),
});

export const buildCategoriesPayload = (
  categories: HelpCategory[],
  uid: string
): Record<string, unknown> => ({
  categories,
  updatedAt: Date.now(),
  updatedBy: uid,
});

export const buildSeedPayload = (
  categories: HelpCategory[],
  uid: string
): Record<string, unknown> => buildCategoriesPayload(categories, uid);
