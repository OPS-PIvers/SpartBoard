import { describe, expect, it } from 'vitest';
import { frqTestSet } from '@/components/dev/quizVersionFixtures';
import {
  VERSION_PICTURES_SKIPPED,
  readTestSet,
} from '@/utils/quizDocumentImport/testSetReader';
import { importedFrq } from './versionFixtures';

describe('readTestSet', () => {
  it('maps every version, keeping its label and its own questions', async () => {
    const set = await importedFrq();
    expect(set.versions.map((v) => v.label)).toEqual([
      'Version A',
      'Version B',
      'Unit 3 Version C',
      'Unit 3 REASSESSMENT',
      'Version Split Pt 1',
      'Version Split Pt 2',
    ]);
    expect(set.versions[0].questions).toHaveLength(1);
    expect(set.versions[0].questions[0].type).toBe('free-response');
    expect(set.fileTitle).toBe('Bohl Unit 3 FRQ (2025)');
    expect(set.title).toBe('Unit 3 FRQ');
  });

  it('crops each version its own pictures, captioned with the printed label', async () => {
    const set = await importedFrq();
    const a = set.versions[0].questions[0].imageIds;
    const b = set.versions[1].questions[0].imageIds;
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    expect(a).not.toEqual(b);
    const names = new Map(set.images.map((i) => [i.id, i.name]));
    expect(a.map((id) => names.get(id))).toEqual(['MAP #1', 'MAP #2']);
    expect(set.versions[2].questions[0].imageIds).toEqual([]);
  });

  it('shares a picture only with the earlier version whose crop is identical', async () => {
    const set = await importedFrq();
    const [a1, a2] = set.versions[0].questions[0].imageIds;
    const [b1, b2] = set.versions[1].questions[0].imageIds;
    const [s1] = set.versions[4].questions[0].imageIds;
    expect(set.sharedImages[b1]).toBe(a1);
    expect(set.sharedImages[b2]).toBe(a2);
    expect(set.sharedImages[s1]).toBe(a1);
    expect(set.sharedImages[a1]).toBeUndefined();
  });

  it('keeps a map that differs as its own picture', async () => {
    const set = await importedFrq({ differentPage: 3 });
    const [b1, b2] = set.versions[1].questions[0].imageIds;
    expect(set.sharedImages[b1]).toBeUndefined();
    expect(set.sharedImages[b2]).toBeUndefined();
  });

  it('says so when the pictures cannot be cropped', async () => {
    const set = await readTestSet(frqTestSet(), { fallbackTitle: 'x' });
    expect(set.warnings).toContain(VERSION_PICTURES_SKIPPED);
    expect(set.images).toEqual([]);
  });
});
