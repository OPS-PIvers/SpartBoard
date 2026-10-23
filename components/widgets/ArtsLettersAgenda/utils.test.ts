import { describe, it, expect } from 'vitest';
import {
  editableAgendaParts,
  listsDiffer,
  partsForVersion,
  resolveAgendaPartLists,
  sanitizeAgendaParts,
} from './utils';
import { DEFAULT_AGENDA_PARTS } from './constants';

describe('sanitizeAgendaParts', () => {
  it('keeps good entries, trims and caps labels, and drops bad or duplicate ones', () => {
    const out = sanitizeAgendaParts([
      { id: 'a', label: '  Warm up  ' },
      { id: 'a', label: 'Duplicate id' },
      { id: '', label: 'No id' },
      { id: 'b', label: '   ' },
      { id: 'c', label: 5 },
      null,
      'text',
      { id: 'd', label: 'x'.repeat(50) },
    ]);
    expect(out).toEqual([
      { id: 'a', label: 'Warm up' },
      { id: 'd', label: 'x'.repeat(30) },
    ]);
  });

  it('stops at eight entries and returns an empty list for non-arrays', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      label: `Step ${i}`,
    }));
    expect(sanitizeAgendaParts(many)).toHaveLength(8);
    expect(sanitizeAgendaParts(undefined)).toEqual([]);
    expect(sanitizeAgendaParts({})).toEqual([]);
  });
});

describe('resolveAgendaPartLists', () => {
  const config = {
    buildingDefaults: {
      'orono-high-school': {
        buildingId: 'orono-high-school',
        detailedParts: [{ id: 'a', label: 'Warm up' }],
      },
    },
  };

  it('falls back to the defaults with no config, no building or an unknown building', () => {
    expect(resolveAgendaPartLists(undefined, 'schumann')).toEqual({
      simple: DEFAULT_AGENDA_PARTS,
      detailed: DEFAULT_AGENDA_PARTS,
    });
    expect(resolveAgendaPartLists(config, undefined).simple).toEqual(
      DEFAULT_AGENDA_PARTS
    );
    expect(resolveAgendaPartLists(config, 'schumann').detailed).toEqual(
      DEFAULT_AGENDA_PARTS
    );
  });

  it('reads a building saved under a legacy id through its canonical id', () => {
    const lists = resolveAgendaPartLists(config, 'high');
    expect(lists.detailed).toEqual([{ id: 'a', label: 'Warm up' }]);
    expect(lists.simple).toEqual(DEFAULT_AGENDA_PARTS);
  });

  it('picks the list for a version, defaulting to Simple', () => {
    const lists = resolveAgendaPartLists(config, 'high');
    expect(partsForVersion(lists, undefined)).toBe(lists.simple);
    expect(partsForVersion(lists, 'detailed')).toBe(lists.detailed);
    expect(listsDiffer(lists.simple, lists.detailed)).toBe(true);
    expect(listsDiffer(lists.simple, lists.simple)).toBe(false);
  });
});

describe('editableAgendaParts', () => {
  it('keeps labels exactly as typed, including spaces and empty text', () => {
    expect(
      editableAgendaParts([
        { id: 'a', label: 'Big ' },
        { id: 'b', label: '' },
        { id: '', label: 'No id' },
        null,
        { id: 'c', label: 5 },
      ])
    ).toEqual([
      { id: 'a', label: 'Big ' },
      { id: 'b', label: '' },
    ]);
    expect(editableAgendaParts(undefined)).toEqual([]);
  });
});
