import { describe, it, expect } from 'vitest';
import {
  sanitizeBoardForRecipient,
  sanitizeBoardSnapshot,
} from '@/utils/dashboardSanitize';
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

  // Decision (PR #2820 review round 2): ink persists with its own Board, but
  // a duplicate, template, or Collection share is a copy of the DESIGN. The
  // recipient starts clean rather than inheriting the author's markup.
  it('DECISION: a snapshot never carries the author markup, even with ink on the board', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      annotationOverlay: {
        objects: [
          {
            id: 'stroke-1',
            kind: 'path',
            z: 1,
            points: [{ x: 0, y: 0 }],
            color: '#000',
            width: 2,
          },
        ],
        updatedAt: 5,
        canvasWidth: 1920,
        canvasHeight: 1080,
      },
    });
    expect(out.annotationOverlay).toBeUndefined();
    // The design itself still travels.
    expect(out.widgets).toEqual([]);
    expect(out.background).toBe('bg-slate-900');
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

describe('sanitizeBoardForRecipient', () => {
  // A Randomizer with a typed-in class list and a Seating Chart custom roster.
  const boardWithNames = (): Dashboard => ({
    ...baseBoard(),
    annotationOverlay: {
      pages: [],
    } as unknown as Dashboard['annotationOverlay'],
    widgets: [
      {
        id: 'w1',
        type: 'random',
        position: { x: 0, y: 0 },
        config: {
          firstNames: 'Alice\nBob',
          lastNames: 'Smith\nJones',
          lastResult: { picked: 'Alice Smith' },
          rosterMode: 'custom',
          assignments: { 'Alice Smith': 'front-left' },
          mode: 'pick',
        },
      },
      {
        id: 'w2',
        type: 'seating-chart',
        position: { x: 0, y: 0 },
        config: { names: ['Charlie', 'Dave'], layout: 'grid' },
      },
    ] as unknown as Dashboard['widgets'],
  });

  it('strips widget-config student names', () => {
    const out = sanitizeBoardForRecipient(boardWithNames());
    const random = out.widgets[0].config as Record<string, unknown>;
    expect(random.firstNames).toBeUndefined();
    expect(random.lastNames).toBeUndefined();
    expect(random.lastResult).toBeUndefined();
    expect(random.assignments).toBeUndefined();
    expect(
      (out.widgets[1].config as Record<string, unknown>).names
    ).toBeUndefined();
  });

  it('keeps non-PII widget config and widget identity', () => {
    const out = sanitizeBoardForRecipient(boardWithNames());
    expect(out.widgets.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect((out.widgets[0].config as Record<string, unknown>).mode).toBe(
      'pick'
    );
    expect((out.widgets[1].config as Record<string, unknown>).layout).toBe(
      'grid'
    );
  });

  it('still applies the board-level snapshot sanitize', () => {
    const out = sanitizeBoardForRecipient({
      ...boardWithNames(),
      driveFileId: 'drive-1',
      isDefault: true,
    });
    expect(out.driveFileId).toBeUndefined();
    expect(out.isDefault).toBeUndefined();
    expect(out.annotationOverlay).toBeUndefined();
  });

  it("does not mutate the caller's board", () => {
    const board = boardWithNames();
    sanitizeBoardForRecipient(board);
    expect(
      (board.widgets[0].config as Record<string, unknown>).firstNames
    ).toBe('Alice\nBob');
  });
});
