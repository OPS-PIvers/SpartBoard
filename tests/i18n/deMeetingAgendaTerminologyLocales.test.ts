// DE locale used two different words for the identical "meeting agenda" concept in the PLC
// feature: plcDashboard.notes.meeting.agenda (Wave 2, #510e534) kept the English loanword
// "Agenda", while plcDashboard.meeting.record.agenda (Wave 3, #eb38a69) correctly used the
// established formal German term "Tagesordnung" — the two keys were translated independently
// in separate feature waves and drifted. ES and FR are each internally consistent across both
// keys (ES: "Agenda"/"Agenda", FR: "Ordre du jour"/"Ordre du jour"); only DE split.

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';

/** Dotted path walker — returns the leaf string or undefined. */
function getLeaf(root: unknown, path: string): string | undefined {
  let node: unknown = root;
  for (const segment of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

const NOTES_KEY = 'plcDashboard.notes.meeting.agenda';
const RECORD_KEY = 'plcDashboard.meeting.record.agenda';

describe('EN locale — both agenda keys represent the same concept', () => {
  it('en.plcDashboard.notes.meeting.agenda and en.plcDashboard.meeting.record.agenda are both "Agenda"', () => {
    expect(getLeaf(en, NOTES_KEY)).toBe('Agenda');
    expect(getLeaf(en, RECORD_KEY)).toBe('Agenda');
  });
});

describe('DE locale — "Agenda"/"Tagesordnung" terminology drift fixed', () => {
  it('de.plcDashboard.notes.meeting.agenda matches de.plcDashboard.meeting.record.agenda', () => {
    expect(getLeaf(de, NOTES_KEY)).toBe(getLeaf(de, RECORD_KEY));
  });

  it('de.plcDashboard.notes.meeting.agenda is "Tagesordnung", not the English loanword "Agenda"', () => {
    expect(getLeaf(de, NOTES_KEY)).toBe('Tagesordnung');
  });

  it('de.plcDashboard.meeting.record.agenda stays "Tagesordnung"', () => {
    expect(getLeaf(de, RECORD_KEY)).toBe('Tagesordnung');
  });
});
