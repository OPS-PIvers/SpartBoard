import type { HelpCategory, HelpResourceItem } from '@/types/helpCenter';
import type { User } from 'firebase/auth';
import type { GuidedLearningSet } from '@/types';

export const HELP_RESOURCES_COLLECTION = 'help_resources';

export type HelpItemFieldPatch = Partial<
  Pick<
    HelpResourceItem,
    'title' | 'description' | 'categoryId' | 'widgetTypes' | 'visible' | 'order'
  >
>;

// Updates never carry openCount, orgId or createdBy: the rules reject those.
export const buildHelpItemFieldsPayload = (
  patch: HelpItemFieldPatch
): Record<string, unknown> => ({ ...patch, updatedAt: Date.now() });

// orgId can't change on update, so a scope change recreates the item under a new id.
export const buildScopeMovePayload = (
  item: HelpResourceItem,
  opts: { id: string; orgId: string | null; user: Pick<User, 'uid' | 'email'> }
): HelpResourceItem => ({
  ...item,
  id: opts.id,
  orgId: opts.orgId,
  openCount: 0,
  createdBy: opts.user.uid,
  createdByEmail: opts.user.email ?? '',
  createdAt: Date.now(),
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

/** A blank building set filed in the Help Center, as New Picture guide starts it. */
export const newPictureGuide = (
  uid: string | undefined,
  now = Date.now()
): GuidedLearningSet => ({
  id: crypto.randomUUID(),
  title: '',
  imageUrls: [],
  steps: [],
  mode: 'structured',
  createdAt: now,
  updatedAt: now,
  authorUid: uid,
  isBuilding: true,
  helpCenter: true,
});
