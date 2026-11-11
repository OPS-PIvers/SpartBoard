import { describe, expect, it } from 'vitest';
import {
  buildDistrictLibraryIndex,
  describeTargeting,
  expandBuildingAliases,
  gradeBuildingsFor,
  indexedItemIdsFor,
  isTargetedAt,
  normalizeTargeting,
  parseEmails,
  targetsNobody,
} from './districtLibraryTargeting';
import type { DistrictLibraryItem } from '@/types/districtLibrary';

const BUILDINGS = [
  { id: 'schumann', gradeLevels: ['k-2' as const] },
  { id: 'intermediate', gradeLevels: ['3-5' as const] },
  { id: 'middle', gradeLevels: ['6-8' as const] },
  { id: 'high', gradeLevels: ['9-12' as const] },
];

const entry = (overrides: Partial<DistrictLibraryItem> = {}) => ({
  everyone: false,
  targetBuildings: [] as string[],
  targetGrades: [] as string[],
  targetEmails: [] as string[],
  gradeBuildings: [] as string[],
  ...overrides,
});

const viewer = (
  overrides: Partial<{
    email: string;
    buildings: string[];
    grades: string[];
  }> = {}
) => ({
  email: 'teacher@orono.k12.mn.us',
  buildings: ['middle'],
  grades: [] as string[],
  ...overrides,
});

describe('expandBuildingAliases', () => {
  it('adds legacy ids so either profile form matches', () => {
    expect(expandBuildingAliases(['middle'])).toEqual([
      'middle',
      'orono-middle-school',
    ]);
    expect(expandBuildingAliases(['orono-high-school'])).toEqual([
      'high',
      'orono-high-school',
    ]);
  });
});

describe('gradeBuildingsFor', () => {
  it('finds buildings whose bands include the grade', () => {
    expect(gradeBuildingsFor(['8'], BUILDINGS)).toEqual([
      'middle',
      'orono-middle-school',
    ]);
    expect(gradeBuildingsFor([], BUILDINGS)).toEqual([]);
  });
});

describe('parseEmails', () => {
  it('splits, lowercases, dedupes and reports junk', () => {
    expect(parseEmails('A@x.org, b@x.org;\na@x.org nope')).toEqual({
      emails: ['a@x.org', 'b@x.org'],
      invalid: ['nope'],
    });
  });
});

describe('normalizeTargeting', () => {
  it('clears the lists when everyone is picked', () => {
    expect(
      normalizeTargeting(
        {
          everyone: true,
          targetBuildings: ['middle'],
          targetGrades: ['8'],
          targetEmails: ['a@x.org'],
        },
        BUILDINGS
      )
    ).toEqual({
      everyone: true,
      targetBuildings: [],
      targetGrades: [],
      targetEmails: [],
      gradeBuildings: [],
    });
  });

  it('normalizes grades and derives grade buildings', () => {
    const t = normalizeTargeting(
      {
        everyone: false,
        targetBuildings: ['high'],
        targetGrades: ['k', '8'],
        targetEmails: ['Teacher@X.org'],
      },
      BUILDINGS
    );
    expect(t.targetGrades).toEqual(['K', '8']);
    expect(t.targetBuildings).toEqual(['high', 'orono-high-school']);
    expect(t.targetEmails).toEqual(['teacher@x.org']);
    expect(t.gradeBuildings).toEqual([
      'middle',
      'orono-middle-school',
      'schumann',
      'schumann-elementary',
    ]);
  });
});

describe('isTargetedAt (mirrors dlTargeted in firestore.rules)', () => {
  it('everyone reaches every teacher', () => {
    expect(isTargetedAt(entry({ everyone: true }), viewer())).toBe(true);
  });

  it('a named teacher matches case-insensitively', () => {
    expect(
      isTargetedAt(
        entry({ targetEmails: ['teacher@orono.k12.mn.us'] }),
        viewer({ email: 'Teacher@Orono.k12.mn.us' })
      )
    ).toBe(true);
  });

  it('a building matches in either id form', () => {
    const e = entry({ targetBuildings: ['middle', 'orono-middle-school'] });
    expect(isTargetedAt(e, viewer())).toBe(true);
    expect(
      isTargetedAt(e, viewer({ buildings: ['orono-middle-school'] }))
    ).toBe(true);
    expect(isTargetedAt(e, viewer({ buildings: ['high'] }))).toBe(false);
  });

  it('a grade matches picked grades, else the buildings teaching it', () => {
    const e = entry({
      targetGrades: ['8'],
      gradeBuildings: ['middle', 'orono-middle-school'],
    });
    expect(
      isTargetedAt(e, viewer({ buildings: ['high'], grades: ['8'] }))
    ).toBe(true);
    expect(isTargetedAt(e, viewer({ buildings: ['middle'], grades: [] }))).toBe(
      true
    );
    // Picked grades win over the building fallback.
    expect(
      isTargetedAt(e, viewer({ buildings: ['middle'], grades: ['6'] }))
    ).toBe(false);
  });

  it('nothing targeted reaches nobody', () => {
    expect(isTargetedAt(entry(), viewer())).toBe(false);
    expect(targetsNobody(entry())).toBe(true);
  });
});

describe('index', () => {
  const item = (id: string, overrides: Partial<DistrictLibraryItem>) => ({
    id,
    kind: 'bank',
    title: id,
    questionCount: 1,
    status: 'published',
    syncGroupId: `g-${id}`,
    contentVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    updatedBy: 'admin',
    ...entry(),
    ...overrides,
  });

  it('holds published items only and never names teachers', () => {
    const index = buildDistrictLibraryIndex(
      [
        item('a', { everyone: true }),
        item('b', { status: 'draft', everyone: true }),
        item('c', { targetEmails: ['x@y.org'] }),
      ],
      5
    );
    expect(Object.keys(index.items).sort()).toEqual(['a', 'c']);
    expect(JSON.stringify(index)).not.toContain('x@y.org');
    expect(index.updatedAt).toBe(5);
  });

  it('lists the ids that reach a viewer', () => {
    const index = buildDistrictLibraryIndex(
      [
        item('a', { everyone: true }),
        item('b', { targetBuildings: ['high'] }),
        item('c', { targetBuildings: ['middle'] }),
      ],
      1
    );
    expect(indexedItemIdsFor(index, viewer())).toEqual(['a', 'c']);
    expect(indexedItemIdsFor(null, viewer())).toEqual([]);
  });
});

describe('describeTargeting', () => {
  it('summarizes in plain words', () => {
    const name = (id: string) => (id === 'middle' ? 'Orono Middle School' : id);
    expect(describeTargeting(entry({ everyone: true }), name)).toBe('Everyone');
    expect(
      describeTargeting(
        entry({
          targetBuildings: ['middle', 'orono-middle-school'],
          targetGrades: ['K', '8'],
          targetEmails: ['a@x.org'],
        }),
        name
      )
    ).toBe('Orono Middle School · K, Grade 8 · 1 teacher');
    expect(describeTargeting(entry(), name)).toBe('Nobody yet');
  });
});
