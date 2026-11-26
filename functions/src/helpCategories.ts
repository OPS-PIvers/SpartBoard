// Help Center categories as help_center/config stores them, shared by the connector and Generate with AI.
// Mirrors DEFAULT_HELP_CATEGORIES in types/helpCenter.ts, which the app shows until help_center/config is saved.
const DEFAULT_CATEGORIES = [
  { id: 'getting-started', name: 'Getting started', order: 0 },
  { id: 'boards-widgets', name: 'Boards & widgets', order: 1 },
  { id: 'quizzes-activities', name: 'Quizzes & activities', order: 2 },
  { id: 'sharing-classes', name: 'Sharing & classes', order: 3 },
  { id: 'admin', name: 'Admin', order: 4 },
];

export interface HelpCategory {
  id: string;
  name: string;
  order: number;
}

export function parseCategories(data: Record<string, unknown> | undefined) {
  const raw = data?.categories;
  const list = Array.isArray(raw)
    ? raw.filter(
        (c): c is HelpCategory =>
          !!c &&
          typeof (c as HelpCategory).id === 'string' &&
          typeof (c as HelpCategory).name === 'string'
      )
    : [];
  return (list.length > 0 ? list : DEFAULT_CATEGORIES)
    .map(({ id, name, order }) => ({ id, name, order: order ?? 0 }))
    .sort((a, b) => a.order - b.order);
}
