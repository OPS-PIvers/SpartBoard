import {
  DEFAULT_HELP_CATEGORIES,
  type HelpCategory,
  type HelpCenterConfig,
  type HelpResourceItem,
} from '@/types/helpCenter';
import type { WidgetType } from '@/types';

// Returns null when required fields (kind, title) are missing so callers can skip malformed docs rather than render broken items.
export const normalizeHelpResourceItem = (
  id: string,
  data: Record<string, unknown>
): HelpResourceItem | null => {
  const kind = data.kind;
  const title = data.title;
  if (
    (kind !== 'embed' && kind !== 'guided-learning') ||
    typeof title !== 'string' ||
    title.length === 0
  ) {
    return null;
  }
  return {
    id,
    kind,
    title,
    description: typeof data.description === 'string' ? data.description : '',
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : '',
    order: typeof data.order === 'number' ? data.order : 0,
    visible: data.visible !== false,
    orgId: typeof data.orgId === 'string' ? data.orgId : null,
    widgetTypes: Array.isArray(data.widgetTypes)
      ? (data.widgetTypes as WidgetType[])
      : [],
    url: typeof data.url === 'string' ? data.url : null,
    embedType:
      typeof data.embedType === 'string'
        ? (data.embedType as HelpResourceItem['embedType'])
        : null,
    setId: typeof data.setId === 'string' ? data.setId : null,
    openCount: typeof data.openCount === 'number' ? data.openCount : 0,
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    createdByEmail:
      typeof data.createdByEmail === 'string' ? data.createdByEmail : '',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
};

export const normalizeHelpCenterConfig = (
  data: Record<string, unknown> | undefined
): HelpCenterConfig => {
  const categories = data?.categories;
  return {
    categories:
      Array.isArray(categories) && categories.length > 0
        ? (categories as HelpCategory[])
        : DEFAULT_HELP_CATEGORIES,
    updatedAt: typeof data?.updatedAt === 'number' ? data.updatedAt : 0,
    updatedBy: typeof data?.updatedBy === 'string' ? data.updatedBy : '',
  };
};

// Sorts by category order, then item order, then title.
export const sortHelpItems = (
  items: HelpResourceItem[],
  categories: HelpCategory[] = DEFAULT_HELP_CATEGORIES
): HelpResourceItem[] => {
  const categoryOrder = new Map(categories.map((c) => [c.id, c.order]));
  return [...items].sort((a, b) => {
    const aOrder = categoryOrder.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = categoryOrder.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });
};
