import type { ChecklistConfig } from '@/types';

/** A checklist row: an item id, or a roster row's id (custom-list name or class student id). */
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

/** True when the rows come from the class roster rather than from config. */
export const checklistUsesClassRoster = (c: ChecklistConfig): boolean =>
  c.mode === 'roster' && (c.rosterMode ?? 'class') === 'class';

/** Unsaved config key the Connections runner fills with the class roster's student ids, in row order. */
export const CHECKLIST_ROSTER_ORDER = '__connectionRosterOrder';

const rosterOrder = (c: ChecklistConfig): string[] => {
  const order = (c as unknown as Record<string, unknown>)[
    CHECKLIST_ROSTER_ORDER
  ];
  return Array.isArray(order)
    ? order.filter((x): x is string => typeof x === 'string')
    : [];
};

// The Checklist's current row: the first one not checked off.
export const currentChecklistRow = (
  c: ChecklistConfig
): ChecklistCurrent | null => {
  if (c.mode === 'roster') {
    const done = new Set(c.completedNames ?? []);
    const rows = checklistUsesClassRoster(c) ? rosterOrder(c) : customNames(c);
    const name = rows.find((n) => !done.has(n));
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
