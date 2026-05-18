import { describe, it, expect } from 'vitest';
import { sanitizeBoardSnapshot } from '@/utils/dashboardSanitize';
import type { Dashboard } from '@/types';

const baseBoard = (): Dashboard => ({
  id: 'b1',
  name: 'Test Board',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1000,
});

describe('sanitizeBoardSnapshot', () => {
  it('keeps id, name, background, widgets, createdAt', () => {
    const out = sanitizeBoardSnapshot(baseBoard());
    expect(out.id).toBe('b1');
    expect(out.name).toBe('Test Board');
    expect(out.background).toBe('bg-slate-900');
    expect(out.widgets).toEqual([]);
    expect(out.createdAt).toBe(1000);
  });

  it('strips linkedShare* fields', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      linkedShareId: 's1',
      linkedShareRole: 'collaborator',
      linkedShareHostName: 'Host',
      linkedShareEnded: true,
    });
    expect(out.linkedShareId).toBeUndefined();
    expect(out.linkedShareRole).toBeUndefined();
    expect(out.linkedShareHostName).toBeUndefined();
    expect(out.linkedShareEnded).toBeUndefined();
  });

  it('strips driveFileId, thumbnailUrl, sharedGroups, annotationOverlay', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      driveFileId: 'drive123',
      thumbnailUrl: 'https://example/thumb.png',
      sharedGroups: [
        { groupId: 'g1', role: 'viewer' },
      ] as unknown as Dashboard['sharedGroups'],
      annotationOverlay: { objects: [], updatedAt: 1 },
    });
    expect(out.driveFileId).toBeUndefined();
    expect(out.thumbnailUrl).toBeUndefined();
    expect(out.sharedGroups).toBeUndefined();
    expect(out.annotationOverlay).toBeUndefined();
  });

  it('strips isDefault, isPinned, updatedAt, collectionId', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      isDefault: true,
      isPinned: true,
      updatedAt: 2000,
      collectionId: 'coll1',
    });
    expect(out.isDefault).toBeUndefined();
    expect(out.isPinned).toBeUndefined();
    expect(out.updatedAt).toBeUndefined();
    expect(out.collectionId).toBeUndefined();
  });

  it('preserves viewport hints (used for proportional layout scaling)', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    expect(out.viewportWidth).toBe(1920);
    expect(out.viewportHeight).toBe(1080);
  });

  it('preserves globalStyle, settings, libraryOrder, order', () => {
    const globalStyle = {
      fontFamily: 'sans' as const,
      windowTransparency: 0.8,
      windowBorderRadius: '2xl' as const,
      dockTransparency: 0.4,
      dockBorderRadius: 'full' as const,
      dockTextColor: '#334155',
      dockTextShadow: false,
    };
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      globalStyle,
      settings: { hideDock: false } as unknown as Dashboard['settings'],
      libraryOrder: ['clock'],
      order: 7,
    });
    expect(out.globalStyle).toEqual(globalStyle);
    expect(out.settings).toEqual({ hideDock: false });
    expect(out.libraryOrder).toEqual(['clock']);
    expect(out.order).toBe(7);
  });
});
