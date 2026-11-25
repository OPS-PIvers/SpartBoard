import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import {
  helpAudienceOf,
  type HelpAudience,
  type HelpCategory,
  type HelpResourceItem,
} from '@/types/helpCenter';
import type { WidgetType } from '@/types';
import type { HelpItemFieldPatch } from './helpCenterAdmin';

export interface HelpDetailsResult {
  title: string;
  description: string;
  categoryId: string;
  audience: HelpAudience;
  widgetTypes: string[];
}

const AUDIENCE_NAMES: Record<HelpAudience, string> = {
  teachers: 'teachers',
  subs: 'subs (substitute portal)',
  students: 'students',
};

/** The prompt an admin pastes into a Claude chat with the SpartBoard connector. */
export function buildClaudePrompt(opts: {
  item: HelpResourceItem;
  categories: readonly HelpCategory[];
  widgetLabels: ReadonlyMap<string, string>;
  scopeLabel: string;
  canChangeScope: boolean;
}): string {
  const { item, categories, widgetLabels, scopeLabel, canChangeScope } = opts;
  const category = categories.find((c) => c.id === item.categoryId);
  const widgets = item.widgetTypes.map((w) => widgetLabels.get(w) ?? w);
  return [
    `Update the Help Center details for the SpartBoard live tour "${item.title}" with the SpartBoard connector.`,
    '',
    `Tour set_id: ${item.setId ?? ''}`,
    '',
    '1. Read get_live_tour_guide, then get_live_tour for this set_id. Read every step.',
    '2. Write a new title and description. Follow the guide\'s "Title and description" section.',
    `3. Pick the category, audience and widgets that fit the tour. ${canChangeScope ? 'Pick the scope too.' : 'Keep the scope as it is.'} list_help_center_categories lists the categories${canChangeScope ? ' and scopes' : ''}.`,
    `4. Save with update_live_tour: pass title, description, and help_center with category_id, audience, widget_types${canChangeScope ? ' and scope' : ''}.`,
    '5. Tell me what you changed.',
    '',
    'Current details:',
    `- Title: ${item.title}`,
    `- Description: ${item.description || '(none)'}`,
    `- Category: ${category ? `${category.name} (${category.id})` : '(none)'}`,
    `- Audience: ${AUDIENCE_NAMES[helpAudienceOf(item)]}`,
    `- Widgets: ${widgets.length ? widgets.join(', ') : '(none)'}`,
    `- Scope: ${scopeLabel}`,
  ].join('\n');
}

/** The fields Generate with AI changes, limited to values this admin can pick. */
export function detailsPatch(
  item: HelpResourceItem,
  result: HelpDetailsResult,
  opts: {
    categoryIds: readonly string[];
    audiences: readonly HelpAudience[];
    widgetIds: ReadonlySet<string>;
  }
): HelpItemFieldPatch {
  const patch: HelpItemFieldPatch = {};
  const title = result.title.trim().slice(0, 200);
  if (title && title !== item.title) patch.title = title;
  const description = result.description.trim().slice(0, 1000);
  if (description && description !== item.description)
    patch.description = description;
  if (
    opts.categoryIds.includes(result.categoryId) &&
    result.categoryId !== item.categoryId
  )
    patch.categoryId = result.categoryId;
  if (
    opts.audiences.includes(result.audience) &&
    result.audience !== helpAudienceOf(item)
  )
    patch.audience = result.audience;
  const widgetTypes = [
    ...new Set(result.widgetTypes.filter((w) => opts.widgetIds.has(w))),
  ] as WidgetType[];
  const same =
    widgetTypes.length === item.widgetTypes.length &&
    widgetTypes.every((w) => item.widgetTypes.includes(w));
  if (!same) patch.widgetTypes = widgetTypes;
  return patch;
}

export async function generateHelpDetails(req: {
  itemId: string;
  audiences: readonly HelpAudience[];
  widgets: readonly { id: string; label: string }[];
}): Promise<HelpDetailsResult> {
  const call = httpsCallable<typeof req, HelpDetailsResult>(
    functions,
    'generateHelpDetailsV1',
    { timeout: 130_000 }
  );
  return (await call(req)).data;
}
