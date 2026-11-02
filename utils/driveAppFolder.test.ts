import { describe, expect, it } from 'vitest';
import { isInAppFolder, type DriveParentMeta } from './driveAppFolder';

const tree: Record<string, DriveParentMeta> = {
  slideFileId1234: { name: 'hotspot-1.webp', parents: ['hotspotFolder1'] },
  rosterFileId1234: { name: 'r.json', parents: ['rosterFolder12'] },
  rootFileId12345: { name: 'x.json', parents: ['appFolder12345'] },
  hotspotFolder1: { name: 'HotspotImages', parents: ['assetsFolder12'] },
  assetsFolder12: { name: 'Assets', parents: ['appFolder12345'] },
  rosterFolder12: { name: 'Rosters', parents: ['appFolder12345'] },
  appFolder12345: { name: 'SpartBoard', parents: ['rootFolder1234'] },
  trashedFolder1: {
    name: 'HotspotImages',
    parents: ['assetsFolder12'],
    trashed: true,
  },
  inTrashFile123: { name: 'a.webp', parents: ['trashedFolder1'] },
  legacyFile1234: { name: 'b.webp', parents: ['legacyHotspot1'] },
  legacyHotspot1: { name: 'HotspotImages', parents: ['legacyAssets12'] },
  legacyAssets12: { name: 'Assets', parents: ['legacyApp12345'] },
  legacyApp12345: { name: 'SPART Board', parents: ['rootFolder1234'] },
  strayFile12345: { name: 'c.webp', parents: ['strayHotspot1'] },
  strayHotspot1: { name: 'HotspotImages', parents: ['strayAssets123'] },
  strayAssets123: { name: 'Stuff', parents: ['appFolder12345'] },
};
const getMeta = (id: string) => Promise.resolve(tree[id] ?? null);

describe('isInAppFolder', () => {
  it('accepts a file in the named app folder', async () => {
    expect(
      await isInAppFolder('slideFileId1234', ['Assets/HotspotImages'], getMeta)
    ).toBe(true);
  });

  it('accepts the legacy app folder name', async () => {
    expect(
      await isInAppFolder('legacyFile1234', ['Assets/HotspotImages'], getMeta)
    ).toBe(true);
  });

  it('rejects a same-named folder under the wrong parent', async () => {
    expect(
      await isInAppFolder('strayFile12345', ['Assets/HotspotImages'], getMeta)
    ).toBe(false);
  });

  it('rejects an app file in another folder', async () => {
    expect(
      await isInAppFolder('rosterFileId1234', ['Assets/HotspotImages'], getMeta)
    ).toBe(false);
    expect(
      await isInAppFolder('rootFileId12345', ['Assets/HotspotImages'], getMeta)
    ).toBe(false);
  });

  it('rejects ids that are not Drive ids, unknown files and Drive errors', async () => {
    expect(
      await isInAppFolder('x/permissions', ['Assets/HotspotImages'], getMeta)
    ).toBe(false);
    expect(
      await isInAppFolder('missingFileId1', ['Assets/HotspotImages'], getMeta)
    ).toBe(false);
    expect(
      await isInAppFolder('slideFileId1234', ['Assets/HotspotImages'], () =>
        Promise.reject(new Error('403'))
      )
    ).toBe(false);
  });

  it('rejects a file whose folder is in the trash', async () => {
    expect(
      await isInAppFolder('inTrashFile123', ['Assets/HotspotImages'], getMeta)
    ).toBe(false);
  });
});
