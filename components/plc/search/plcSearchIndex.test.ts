import { describe, it, expect } from 'vitest';
import {
  flattenSearchGroups,
  MatchTier,
  PLC_SEARCH_MIN_QUERY_LENGTH,
  PLC_SEARCH_PER_SECTION_LIMIT,
  PLC_SEARCH_TOTAL_LIMIT,
  searchPlcRecords,
  type PlcSearchRecord,
} from './plcSearchIndex';

/** Tiny record builder so the cases stay readable. */
function rec(
  partial: Partial<PlcSearchRecord> & Pick<PlcSearchRecord, 'id' | 'title'>
): PlcSearchRecord {
  return {
    kind: 'note',
    section: 'docs',
    ...partial,
  };
}

describe('searchPlcRecords — minimum query length', () => {
  const records = [rec({ id: 'a', title: 'Fractions quiz' })];

  it('returns nothing for an empty query', () => {
    expect(searchPlcRecords(records, '')).toEqual([]);
  });

  it('returns nothing for a query shorter than the minimum', () => {
    const tooShort = 'a'.repeat(PLC_SEARCH_MIN_QUERY_LENGTH - 1);
    expect(searchPlcRecords(records, tooShort)).toEqual([]);
  });

  it('returns nothing for a whitespace-only query', () => {
    expect(searchPlcRecords(records, '   ')).toEqual([]);
  });

  it('runs once the trimmed query reaches the minimum length', () => {
    const groups = searchPlcRecords(records, ' fr ');
    expect(flattenSearchGroups(groups)).toHaveLength(1);
  });
});

describe('searchPlcRecords — case-insensitive substring matching', () => {
  const records = [
    rec({ id: 'a', title: 'Fractions Quiz' }),
    rec({ id: 'b', title: 'Decimals worksheet' }),
  ];

  it('matches regardless of case in the query', () => {
    expect(flattenSearchGroups(searchPlcRecords(records, 'FRACTIONS'))).toEqual(
      [expect.objectContaining({ id: 'a' })]
    );
  });

  it('matches regardless of case in the record title', () => {
    expect(flattenSearchGroups(searchPlcRecords(records, 'quiz'))).toEqual([
      expect.objectContaining({ id: 'a' }),
    ]);
  });

  it('matches an interior substring, not just a prefix', () => {
    expect(flattenSearchGroups(searchPlcRecords(records, 'cimal'))).toEqual([
      expect.objectContaining({ id: 'b' }),
    ]);
  });

  it('returns no results when nothing matches', () => {
    expect(searchPlcRecords(records, 'geometry')).toEqual([]);
  });
});

describe('searchPlcRecords — snippet matching', () => {
  const records = [
    rec({
      id: 'a',
      title: 'Weekly note',
      snippet: 'discuss the photosynthesis lab',
    }),
    rec({ id: 'b', title: 'Photosynthesis unit', snippet: 'plan' }),
  ];

  it('matches in the snippet when the title does not match', () => {
    const flat = flattenSearchGroups(searchPlcRecords(records, 'lab'));
    expect(flat).toHaveLength(1);
    expect(flat[0].id).toBe('a');
    expect(flat[0].matchedField).toBe('snippet');
  });

  it('ranks a title match above a snippet match for the same needle', () => {
    const flat = flattenSearchGroups(
      searchPlcRecords(records, 'photosynthesis')
    );
    // 'b' matches in the title (tier 0/1), 'a' only in the snippet (tier 2).
    expect(flat.map((r) => r.id)).toEqual(['b', 'a']);
    expect(flat[0].matchedField).toBe('title');
    expect(flat[1].matchedField).toBe('snippet');
  });
});

describe('searchPlcRecords — ranking', () => {
  it('ranks a title prefix above a title substring', () => {
    const records = [
      rec({ id: 'sub', title: 'My fraction lesson' }),
      rec({ id: 'pre', title: 'Fraction basics' }),
    ];
    const flat = flattenSearchGroups(searchPlcRecords(records, 'fraction'));
    expect(flat.map((r) => r.id)).toEqual(['pre', 'sub']);
    expect(flat[0].tier).toBe(MatchTier.TitlePrefix);
    expect(flat[1].tier).toBe(MatchTier.TitleSubstring);
  });

  it('ranks an earlier match offset above a later one within the same tier', () => {
    const records = [
      rec({ id: 'late', title: 'x x x abc' }),
      rec({ id: 'early', title: 'x abc x x' }),
    ];
    const flat = flattenSearchGroups(searchPlcRecords(records, 'abc'));
    expect(flat.map((r) => r.id)).toEqual(['early', 'late']);
  });

  it('breaks ties by title then id for a stable, deterministic order', () => {
    // Same query offset (all titles are "<word> quiz" with 'quiz' at offset 5),
    // so ordering falls through to title localeCompare, then id.
    const records = [
      rec({ id: 'z', title: 'Alpha quiz' }),
      rec({ id: 'a', title: 'Alpha quiz' }),
      rec({ id: 'm', title: 'Beta. quiz' }),
    ];
    const flat = flattenSearchGroups(searchPlcRecords(records, 'quiz'));
    // 'Alpha quiz' < 'Beta. quiz' by title; the two 'Alpha quiz' rows tie on
    // title and are broken by id ('a' < 'z').
    expect(flat.map((r) => r.id)).toEqual(['a', 'z', 'm']);
  });

  it('is stable under input reordering (same results, same order)', () => {
    const records = [
      rec({ id: 'a', title: 'Alpha quiz' }),
      rec({ id: 'b', title: 'Beta quiz' }),
      rec({ id: 'c', title: 'Gamma quiz' }),
    ];
    const forward = flattenSearchGroups(searchPlcRecords(records, 'quiz')).map(
      (r) => r.id
    );
    const reversed = flattenSearchGroups(
      searchPlcRecords([...records].reverse(), 'quiz')
    ).map((r) => r.id);
    expect(reversed).toEqual(forward);
  });
});

describe('searchPlcRecords — grouping', () => {
  it('groups results by section in the fixed section order', () => {
    const records = [
      rec({ id: 'd1', title: 'shared note', kind: 'note', section: 'docs' }),
      rec({
        id: 'b1',
        title: 'shared board',
        kind: 'board',
        section: 'sharedBoards',
      }),
      rec({
        id: 'a1',
        title: 'shared quiz',
        kind: 'quiz',
        section: 'assessments',
      }),
      rec({
        id: 's1',
        title: 'shared assessment',
        kind: 'assessment',
        section: 'sharedData',
      }),
    ];
    const groups = searchPlcRecords(records, 'shared');
    expect(groups.map((g) => g.section)).toEqual([
      'assessments',
      'sharedData',
      'docs',
      'sharedBoards',
    ]);
  });

  it('omits sections that have no matches', () => {
    const records = [
      rec({
        id: 'a1',
        title: 'quiz one',
        kind: 'quiz',
        section: 'assessments',
      }),
      rec({ id: 'd1', title: 'unrelated', kind: 'note', section: 'docs' }),
    ];
    const groups = searchPlcRecords(records, 'quiz');
    expect(groups.map((g) => g.section)).toEqual(['assessments']);
  });

  it('caps each section group at the per-section limit', () => {
    const records = Array.from(
      { length: PLC_SEARCH_PER_SECTION_LIMIT + 4 },
      (_, i) =>
        rec({
          id: `q${i}`,
          title: `quiz ${String(i).padStart(2, '0')}`,
          kind: 'quiz',
          section: 'assessments',
        })
    );
    const groups = searchPlcRecords(records, 'quiz');
    expect(groups).toHaveLength(1);
    expect(groups[0].results).toHaveLength(PLC_SEARCH_PER_SECTION_LIMIT);
  });

  it('caps the total number of results across all groups', () => {
    // Spread well beyond the total cap across all four sections, each filled
    // past its per-section limit, so the global cap is what bites.
    const sections = [
      'assessments',
      'sharedData',
      'docs',
      'sharedBoards',
    ] as const;
    const records: PlcSearchRecord[] = [];
    for (const section of sections) {
      for (let i = 0; i < PLC_SEARCH_PER_SECTION_LIMIT; i++) {
        records.push(
          rec({
            id: `${section}-${i}`,
            title: `match ${section} ${i}`,
            section,
            kind: section === 'sharedBoards' ? 'board' : 'note',
          })
        );
      }
    }
    const groups = searchPlcRecords(records, 'match');
    const total = flattenSearchGroups(groups).length;
    expect(total).toBeLessThanOrEqual(PLC_SEARCH_TOTAL_LIMIT);
  });
});

describe('flattenSearchGroups', () => {
  it('flattens groups in render order (group order then within-group order)', () => {
    const records = [
      rec({
        id: 'a1',
        title: 'find quiz',
        kind: 'quiz',
        section: 'assessments',
      }),
      rec({ id: 'd1', title: 'find note', kind: 'note', section: 'docs' }),
    ];
    const groups = searchPlcRecords(records, 'find');
    expect(flattenSearchGroups(groups).map((r) => r.id)).toEqual(['a1', 'd1']);
  });

  it('returns an empty array for empty groups', () => {
    expect(flattenSearchGroups([])).toEqual([]);
  });
});
