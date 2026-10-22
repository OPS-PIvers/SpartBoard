import { describe, expect, it } from 'vitest';
import { planCopyImportTree } from '@/utils/sharedCollectionTree';

describe('planCopyImportTree', () => {
  const sections = [
    { id: 'week', name: 'Week' },
    { id: 'mon', name: 'Monday', parentId: 'week', color: '#f00' },
    { id: 'am', name: 'Morning', parentId: 'mon' },
    { id: 'tue', name: 'Tuesday', parentId: 'week' },
  ];
  const boards = [
    { id: 'intro', name: 'Intro', sectionId: 'week', order: 0 },
    { id: 'm1', name: 'M1', sectionId: 'mon', order: 1 },
    { id: 'a1', name: 'A1', sectionId: 'am', order: 2 },
  ];

  it('creates each sub-collection after its parent, the root left out', () => {
    const plan = planCopyImportTree({ sections, boards });
    expect(plan.children).toEqual([
      { id: 'mon', name: 'Monday', color: '#f00', parentId: null },
      { id: 'am', name: 'Morning', parentId: 'mon' },
      { id: 'tue', name: 'Tuesday', parentId: null },
    ]);
  });

  it('places boards in their sub-collection and root boards nowhere', () => {
    const { sectionOf } = planCopyImportTree({ sections, boards });
    expect(sectionOf.get('m1')).toBe('mon');
    expect(sectionOf.get('a1')).toBe('am');
    expect(sectionOf.has('intro')).toBe(false);
  });

  it('puts a section whose parent is unknown under the root', () => {
    const plan = planCopyImportTree({
      sections: [
        { id: 'root', name: 'Root' },
        { id: 'x', name: 'X', parentId: 'gone' },
      ],
    });
    expect(plan.children).toEqual([{ id: 'x', name: 'X', parentId: null }]);
  });

  it('reads an older share with no tree as a flat collection', () => {
    expect(planCopyImportTree({}).children).toEqual([]);
  });
});
