import { afterEach, describe, expect, it } from 'vitest';
import type { GuidedLearningStep, TourMaterial } from '@/types';
import {
  endTourSandbox,
  getTourSandbox,
  isSandboxed,
  startTourSandbox,
  tourMaterialItem,
} from '@/utils/tourSandbox';
import {
  authorFreeSnapshot,
  checkpointAt,
  materialForOpenItem,
  resolveOpenMaterial,
  seedTourMaterials,
} from './tourMaterialSeed';

const sample = {
  meta: { id: 'orig', title: 'Sample', driveFileId: 'drive-1' },
  data: { id: 'orig', title: 'Sample', questions: [] },
  fromId: 'orig',
  title: 'Sample',
};
const materials: TourMaterial[] = [
  { id: 'm-sample', kind: 'quiz', source: 'sample', label: '', sample },
  { id: 'm-teacher', kind: 'quiz', source: 'teacher', label: '' },
  { id: 'm-made', kind: 'quiz', source: 'created', label: '' },
];

afterEach(() => endTourSandbox());

describe('seedTourMaterials', () => {
  it('loads each sample as a fresh copy with its own id and file', () => {
    startTourSandbox();
    seedTourMaterials(materials, { edit: true });
    const bound = tourMaterialItem('m-sample');
    expect(bound?.id).not.toBe('orig');
    const copy = getTourSandbox().items.quiz.get(bound?.id ?? '');
    expect(copy?.meta).toMatchObject({
      id: bound?.id,
      driveFileId: `sandbox:${bound?.id}`,
    });
    expect(copy?.data.id).toBe(bound?.id);
    expect(tourMaterialItem('m-teacher')).toBeUndefined();
  });

  it("binds a teacher's pick as a real item whose writes go through", () => {
    startTourSandbox();
    seedTourMaterials(materials, { edit: false, picks: { 'm-teacher': 'q9' } });
    expect(tourMaterialItem('m-teacher')).toEqual({ kind: 'quiz', id: 'q9' });
    expect(isSandboxed('q9')).toBe(false);
  });

  it('ignores picks in the editor', () => {
    startTourSandbox();
    seedTourMaterials(materials, { edit: true, picks: { 'm-teacher': 'q9' } });
    expect(tourMaterialItem('m-teacher')).toBeUndefined();
    expect(isSandboxed('q9')).toBe(true);
  });
});

describe('resolveOpenMaterial', () => {
  it('recreates a made-in-the-tour item from the content a step saved', () => {
    startTourSandbox();
    const open = {
      materialId: 'm-made',
      slot: 0,
      content: { meta: { id: 'old', title: 'Made' }, data: { id: 'old' } },
    };
    const item = resolveOpenMaterial(open, materials);
    expect(item?.kind).toBe('quiz');
    expect(item?.itemId).not.toBe('old');
    expect(tourMaterialItem('m-made')?.id).toBe(item?.itemId);
    expect(resolveOpenMaterial(open, materials)).toEqual(item);
  });
});

describe('materialForOpenItem', () => {
  it('adds a made-in-the-tour material for an item no material covers', () => {
    startTourSandbox();
    const found = materialForOpenItem('quiz', 'x', materials, 'Made');
    expect(found.added).toBe(true);
    expect(found.material).toMatchObject({ kind: 'quiz', source: 'created' });
    expect(tourMaterialItem(found.material.id)?.id).toBe('x');
  });
});

describe('checkpointAt', () => {
  const steps = [
    {},
    { tour: { anchor: 'a', action: 'click', start: { layouts: [] } } },
    {},
  ] as unknown as GuidedLearningStep[];
  it('finds the nearest step with a saved board at or before the index', () => {
    expect(checkpointAt(steps, 0)).toBe(0);
    expect(checkpointAt(steps, 1)).toBe(1);
    expect(checkpointAt(steps, 2)).toBe(1);
  });
});

describe('authorFreeSnapshot', () => {
  it("drops the author's Drive, account and sync ids and keeps the content", () => {
    const meta = {
      id: 'q1',
      title: 'Quiz',
      driveFileId: 'drive-1',
      driveFileIds: ['d2'],
      authorUid: 'author-1',
      sync: { groupId: 'g1' },
      questions: [{ id: 'a' }],
    };
    expect(authorFreeSnapshot(meta)).toEqual({
      id: 'q1',
      title: 'Quiz',
      questions: [{ id: 'a' }],
    });
    expect(meta.driveFileId).toBe('drive-1');
  });
});
