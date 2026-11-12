import { describe, expect, it } from 'vitest';
import type { DistrictLibraryItem } from '@/types/districtLibrary';
import {
  childFolders,
  folderAudienceFor,
  folderPathLabel,
  followsFolder,
  foldersWithItems,
  isInFolder,
  itemsNeedingFolderAudience,
  nextFolderOrder,
  shortTitle,
  startingFolder,
  wouldNestInSelf,
  type FolderAudience,
  type FolderMap,
} from './districtLibraryFolders';
import {
  DISTRICT_SOURCE_FOLDER,
  districtBankFolderId,
  districtMirrorId,
  districtSourceFolders,
} from '@/components/widgets/QuizWidget/components/districtBankFolders';

const folders: FolderMap = {
  sci: { name: 'MCA Science', parentId: null, order: 0 },
  g8: { name: 'Grade 8', parentId: 'sci', order: 1 },
  g5: { name: 'Grade 5', parentId: 'sci', order: 0 },
  math: { name: 'MCA Math', parentId: null, order: 1 },
  orphan: { name: 'Orphan', parentId: 'gone', order: 5 },
};

const audience = (emails: string[]): FolderAudience => ({
  everyone: false,
  targetBuildings: [],
  targetGrades: [],
  targetEmails: emails,
  gradeBuildings: [],
});

const item = (over: Partial<DistrictLibraryItem>): DistrictLibraryItem =>
  ({
    id: 'i',
    title: 'T',
    everyone: false,
    targetBuildings: [],
    targetGrades: [],
    targetEmails: [],
    gradeBuildings: [],
    ...over,
  }) as DistrictLibraryItem;

describe('district library folder tree', () => {
  it('lists children in order and treats an orphan as top level', () => {
    expect(childFolders(folders, null).map((f) => f.id)).toEqual([
      'sci',
      'math',
      'orphan',
    ]);
    expect(childFolders(folders, 'sci').map((f) => f.id)).toEqual(['g5', 'g8']);
  });

  it('builds paths and detects nesting', () => {
    expect(folderPathLabel(folders, 'g8')).toBe('MCA Science / Grade 8');
    expect(isInFolder(folders, 'g8', 'sci')).toBe(true);
    expect(isInFolder(folders, 'math', 'sci')).toBe(false);
    expect(wouldNestInSelf(folders, 'sci', 'g8')).toBe(true);
    expect(wouldNestInSelf(folders, 'g8', 'math')).toBe(false);
    expect(nextFolderOrder(folders, 'sci')).toBe(2);
  });

  it('takes the nearest folder audience up the chain', () => {
    const audiences = { sci: audience(['a@x.org']) };
    expect(folderAudienceFor(folders, audiences, 'g8')?.folderId).toBe('sci');
    expect(
      folderAudienceFor(
        folders,
        { ...audiences, g8: audience(['b@x.org']) },
        'g8'
      )?.folderId
    ).toBe('g8');
    expect(folderAudienceFor(folders, audiences, 'math')).toBeNull();
  });

  it('finds items that follow their folder but lack its audience', () => {
    const audiences = { g8: audience(['a@x.org']) };
    const follows = item({ id: 'a', folderId: 'g8' });
    const own = item({ id: 'b', folderId: 'g8', ownTargeting: true });
    const done = item({ id: 'c', folderId: 'g8', targetEmails: ['a@x.org'] });
    const loose = item({ id: 'd' });
    expect(followsFolder(folders, own)).toBe(false);
    expect(followsFolder(folders, loose)).toBe(false);
    expect(
      itemsNeedingFolderAudience(
        [follows, own, done, loose],
        folders,
        audiences
      ).map((n) => n.item.id)
    ).toEqual(['a']);
  });

  it('shortens series titles only when a prefix exists', () => {
    expect(shortTitle('MCA IV Science Grade 8: Light Bulbs')).toBe(
      'Light Bulbs'
    );
    expect(shortTitle('Light Bulbs')).toBe('Light Bulbs');
    expect(shortTitle(': odd')).toBe(': odd');
  });

  it('opens at the one shared folder, else the top', () => {
    expect(
      startingFolder(folders, [{ folderId: 'g8' }, { folderId: 'g8' }])
    ).toBe('g8');
    expect(
      startingFolder(folders, [{ folderId: 'g8' }, { folderId: 'g5' }])
    ).toBeNull();
    expect(startingFolder(folders, [{ folderId: 'g8' }, {}])).toBeNull();
    expect(startingFolder(folders, [])).toBeNull();
    expect([...foldersWithItems(folders, [{ folderId: 'g8' }])].sort()).toEqual(
      ['g8', 'sci']
    );
  });
});

describe('Quiz library District library folder', () => {
  it('mirrors only folders holding added banks, under one pinned folder', () => {
    const out = districtSourceFolders(folders, ['g8', null]);
    expect(out.map((f) => [f.id, f.parentId])).toEqual([
      [DISTRICT_SOURCE_FOLDER, null],
      [districtMirrorId('sci'), DISTRICT_SOURCE_FOLDER],
      [districtMirrorId('g8'), districtMirrorId('sci')],
    ]);
    expect(districtSourceFolders(folders, [])).toEqual([]);
  });

  it("places a bank in the teacher's folder, else its district folder", () => {
    const own = new Set(['mine']);
    expect(districtBankFolderId(folders, 'g8', 'mine', own)).toBe('mine');
    expect(districtBankFolderId(folders, 'g8', 'deleted', own)).toBe(
      districtMirrorId('g8')
    );
    expect(districtBankFolderId(folders, 'gone', undefined, own)).toBe(
      DISTRICT_SOURCE_FOLDER
    );
  });
});
