// Before/after rows for View as pending changes (docs/plans/ADMIN_VIEW_AS.md D11).
import { stableStringify } from '@/utils/stableStringify';
import type { PendingChange } from '@/utils/viewAsBoards';

const FIELD_LABELS: Record<string, string> = {
  xProp: 'Left',
  yProp: 'Top',
  wProp: 'Width',
  hProp: 'Height',
  aspectRatio: 'Shape',
  z: 'Layer',
  minimized: 'Minimized',
  maximized: 'Maximized',
  flipped: 'Flipped',
  groupId: 'Group',
  backgroundColor: 'Background',
  fontFamily: 'Font',
  baseTextSize: 'Text size',
  transparency: 'Transparency',
  buildingId: 'Building',
  customTitle: 'Title',
  isPinned: 'Pinned',
  isLocked: 'Locked',
};

const PERCENT_FIELDS = new Set(['xProp', 'yProp', 'wProp', 'hProp']);

export const words = (key: string): string => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export function formatPendingValue(
  field: string,
  value: unknown,
  other?: unknown
): string {
  if (value === undefined && typeof other === 'boolean') return 'Off';
  if (value === undefined || value === null || value === '') return 'None';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') {
    if (PERCENT_FIELDS.has(field)) return `${Math.round(value * 100)}%`;
    return String(Math.round(value * 100) / 100);
  }
  if (typeof value === 'string') {
    return value.length > 40 ? `${value.slice(0, 39)}…` : value;
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  return 'Edited';
}

export interface PendingRow {
  field: string;
  label: string;
  before: string;
  after: string;
}

export function pendingRows(change: PendingChange): PendingRow[] {
  const rows: PendingRow[] = [];
  const fields = Array.from(
    new Set([...Object.keys(change.before), ...Object.keys(change.after)])
  );
  for (const field of fields) {
    if (field === 'config') {
      const b = (change.before.config ?? {}) as Record<string, unknown>;
      const a = (change.after.config ?? {}) as Record<string, unknown>;
      const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
      for (const key of keys) {
        if (stableStringify(b[key]) === stableStringify(a[key])) continue;
        rows.push({
          field: `config.${key}`,
          label: words(key),
          before: formatPendingValue(key, b[key], a[key]),
          after: formatPendingValue(key, a[key], b[key]),
        });
      }
      continue;
    }
    rows.push({
      field,
      label: FIELD_LABELS[field] ?? words(field),
      before: formatPendingValue(
        field,
        change.before[field],
        change.after[field]
      ),
      after: formatPendingValue(
        field,
        change.after[field],
        change.before[field]
      ),
    });
  }
  return rows;
}
