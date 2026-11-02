import type { ChecklistConfig } from '@/types';

/** A checklist row the config alone can name: an item id, or a custom-list name. Class rosters need the roster, so they return null. */
export type ChecklistCurrent =
  { kind: 'item'; id: string } | { kind: 'name'; id: string };

const customNames = (c: ChecklistConfig): string[] => {
  const split = (s?: string) =>
    (s ?? '')
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);
  const firsts = split(c.firstNames);
  const lasts = split(c.lastNames);
  const out: string[] = [];
  for (let i = 0; i < Math.max(firsts.length, lasts.length); i++) {
    const name = `${firsts[i] ?? ''} ${lasts[i] ?? ''}`.trim();
    if (name) out.push(name);
  }
  return out;
};

/** True when the current row is worked out by the widget from the class roster, not from config. */
export const checklistUsesClassRoster = (c: ChecklistConfig): boolean =>
  c.mode === 'roster' && (c.rosterMode ?? 'class') === 'class';

// The Checklist's current row: the first one not checked off.
export const currentChecklistRow = (
  c: ChecklistConfig
): ChecklistCurrent | null => {
  if (c.mode === 'roster') {
    if (checklistUsesClassRoster(c)) return null;
    const done = new Set(c.completedNames ?? []);
    const name = customNames(c).find((n) => !done.has(n));
    return name ? { kind: 'name', id: name } : null;
  }
  const item = (c.items ?? []).find((i) => !i.completed);
  return item ? { kind: 'item', id: item.id } : null;
};

// Patch that checks off the current row, and whether nothing is left after it; null when nothing is left now.
export const checkOffCurrent = (
  c: ChecklistConfig
): { patch: Partial<ChecklistConfig>; ends: boolean } | null => {
  const row = currentChecklistRow(c);
  if (!row) return null;
  const patch: Partial<ChecklistConfig> =
    row.kind === 'item'
      ? {
          items: (c.items ?? []).map((i) =>
            i.id === row.id ? { ...i, completed: true } : i
          ),
        }
      : { completedNames: [...(c.completedNames ?? []), row.id] };
  return { patch, ends: !currentChecklistRow({ ...c, ...patch }) };
};
