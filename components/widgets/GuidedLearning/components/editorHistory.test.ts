import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  documentFromSet,
  editorHistoryReducer,
  initialHistory,
  pendingMediaDeletions,
  type EditorHistoryState,
} from './editorHistory';
import { useGuidedLearningEditorState } from './useGuidedLearningEditorState';

// Adapts per-file spies to the editor's batched release callback.
const releaseVia =
  (
    deleteFile: (path: string) => unknown,
    deleteDriveFile: (id: string) => unknown
  ) =>
  (files: { storagePaths: string[]; driveFileIds: string[] }) => {
    files.storagePaths.forEach((p) => deleteFile(p));
    files.driveFileIds.forEach((id) => deleteDriveFile(id));
    return Promise.resolve();
  };

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadHotspotImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
  }),
}));

const step = (
  id: string,
  imageIndex: number,
  extra: Partial<GuidedLearningStep> = {}
): GuidedLearningStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex,
  interactionType: 'text-popover',
  showOverlay: 'none',
  text: '',
  ...extra,
});

const makeSet = (overrides: Partial<GuidedLearningSet> = {}) =>
  ({
    id: 'set-1',
    schemaVersion: 2,
    title: 'Original',
    imageUrls: ['a.png', 'b.png', 'c.png'],
    steps: [step('s0', 0), step('s1', 1), step('s2', 2)],
    mode: 'structured',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }) as GuidedLearningSet;

const renderEditor = (set: GuidedLearningSet | null = makeSet()) =>
  renderHook(
    ({ existingSet }) =>
      useGuidedLearningEditorState({ existingSet, existingMeta: null }),
    { initialProps: { existingSet: set } }
  );

describe('editorHistoryReducer', () => {
  const base = () => initialHistory(documentFromSet(makeSet()));
  const retitle = (
    s: EditorHistoryState,
    title: string,
    at: number,
    coalesceKey?: string
  ) =>
    editorHistoryReducer(s, {
      type: 'apply',
      update: (d) => ({ ...d, title }),
      coalesceKey,
      at,
    });

  it('ignores edits that return the same document', () => {
    const s = base();
    expect(
      editorHistoryReducer(s, { type: 'apply', update: (d) => d, at: 0 })
    ).toBe(s);
  });

  it(`caps history at ${HISTORY_LIMIT} entries`, () => {
    let s = base();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s = retitle(s, `t${i}`, i);
    expect(s.past).toHaveLength(HISTORY_LIMIT);
    expect(s.past[0].doc.title).toBe('t19');
  });

  it('keeps a deletion owed when its entry is trimmed off the cap', () => {
    let s = retitle(base(), 'replaced', 0);
    s = editorHistoryReducer(s, {
      type: 'queueMedia',
      ref: { storagePath: 'old.png' },
    });
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) s = retitle(s, `t${i}`, i + 1);
    expect(pendingMediaDeletions(s)).toEqual([{ storagePath: 'old.png' }]);
  });

  it('coalesces same-key edits only within the pause window', () => {
    let s = retitle(base(), 'a', 0, 'title');
    s = retitle(s, 'ab', COALESCE_MS - 1, 'title');
    expect(s.past).toHaveLength(1);
    s = retitle(s, 'abc', 2 * COALESCE_MS, 'title');
    expect(s.past).toHaveLength(2);
    s = retitle(s, 'abcd', 2 * COALESCE_MS + 10, 'description');
    expect(s.past).toHaveLength(3);
  });

  it('holds undo and redo while a gesture is open', () => {
    let s = retitle(base(), 'a', 0);
    s = editorHistoryReducer(s, { type: 'beginGesture' });
    expect(editorHistoryReducer(s, { type: 'undo' })).toBe(s);
  });

  it('drops a gesture that changed nothing', () => {
    let s = editorHistoryReducer(base(), { type: 'beginGesture' });
    s = editorHistoryReducer(s, { type: 'endGesture' });
    expect(s.past).toHaveLength(0);
    expect(s.gestureBase).toBeNull();
  });
});

describe('useGuidedLearningEditorState history', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('undoes and redoes adding a step', () => {
    const { result } = renderEditor();
    act(() => result.current.addStepAt(20, 30));
    expect(result.current.steps).toHaveLength(4);
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.steps).toHaveLength(3);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.steps).toHaveLength(4);
    expect(result.current.steps[3]).toMatchObject({ xPct: 20, yPct: 30 });
  });

  it('records a whole move gesture as one entry', () => {
    const { result } = renderEditor();
    act(() => result.current.addStepAt(10, 10));
    act(() => result.current.beginGesture());
    expect(result.current.canUndo).toBe(false);
    for (let i = 1; i <= 30; i++) {
      act(() => {
        vi.advanceTimersByTime(COALESCE_MS + 1);
        result.current.updateStep({ ...result.current.steps[0], xPct: i });
      });
    }
    act(() => result.current.endGesture());
    expect(result.current.canUndo).toBe(true);
    expect(result.current.steps[0].xPct).toBe(30);
    act(() => result.current.undo());
    expect(result.current.steps[0].xPct).toBe(50);
    expect(result.current.steps).toHaveLength(4);
  });

  it('undoes deleting a step', () => {
    const { result } = renderEditor();
    act(() => result.current.setSelectedStepId('s1'));
    act(() => result.current.deleteStep('s1'));
    expect(result.current.steps.map((s) => s.id)).toEqual(['s0', 's2']);
    expect(result.current.selectedStepId).toBeNull();
    act(() => result.current.undo());
    expect(result.current.steps.map((s) => s.id)).toEqual(['s0', 's1', 's2']);
  });

  it('undoes deleting a slide and restores the shifted image indexes', () => {
    const { result } = renderEditor();
    act(() => result.current.deleteImage(0));
    expect(result.current.imageUrls).toEqual(['b.png', 'c.png']);
    expect(result.current.steps.map((s) => [s.id, s.imageIndex])).toEqual([
      ['s1', 0],
      ['s2', 1],
    ]);
    act(() => result.current.undo());
    expect(result.current.imageUrls).toEqual(['a.png', 'b.png', 'c.png']);
    expect(result.current.imageKinds).toEqual(['image', 'image', 'image']);
    expect(result.current.steps.map((s) => [s.id, s.imageIndex])).toEqual([
      ['s0', 0],
      ['s1', 1],
      ['s2', 2],
    ]);
  });

  it('clamps the shown slide when redo removes it', () => {
    const { result } = renderEditor();
    act(() => result.current.deleteImage(0));
    act(() => result.current.undo());
    act(() => result.current.setCurrentImageIndex(2));
    act(() => result.current.redo());
    expect(result.current.imageUrls).toHaveLength(2);
    expect(result.current.currentImageIndex).toBe(1);
  });

  it('undoes a watch pace change', () => {
    const { result } = renderEditor(makeSet({ watchPace: 'calm' }));
    expect(result.current.watchPace).toBe('calm');
    act(() => result.current.setWatchPace(undefined));
    expect(result.current.watchPace).toBeUndefined();
    act(() => result.current.undo());
    expect(result.current.watchPace).toBe('calm');
  });

  it('undoes a reorder in one step', () => {
    const { result } = renderEditor();
    const [a, b, c] = result.current.steps;
    act(() => result.current.reorderSteps([c, a, b]));
    expect(result.current.steps.map((s) => s.id)).toEqual(['s2', 's0', 's1']);
    act(() => result.current.undo());
    expect(result.current.steps.map((s) => s.id)).toEqual(['s0', 's1', 's2']);
  });

  it('applies a functional setSteps updater against the latest steps', () => {
    const { result } = renderEditor();
    act(() => {
      result.current.setSteps((prev) => prev.slice(1));
      result.current.setSteps((prev) => prev.slice(1));
    });
    expect(result.current.steps.map((s) => s.id)).toEqual(['s2']);
    act(() => result.current.undo());
    expect(result.current.steps.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('coalesces typing into one entry per pause', () => {
    const { result } = renderEditor();
    for (const t of ['N', 'Ne', 'New']) {
      act(() => {
        vi.advanceTimersByTime(100);
        result.current.setTitle(t);
      });
    }
    act(() => {
      vi.advanceTimersByTime(COALESCE_MS + 1);
      result.current.setTitle('New!');
    });
    act(() => result.current.undo());
    expect(result.current.title).toBe('New');
    act(() => result.current.undo());
    expect(result.current.title).toBe('Original');
    expect(result.current.canUndo).toBe(false);
  });

  it('coalesces step text typing per step', () => {
    const { result } = renderEditor();
    for (const text of ['H', 'Hi', 'Hi!']) {
      act(() => {
        vi.advanceTimersByTime(100);
        result.current.updateStep({ ...result.current.steps[1], text });
      });
    }
    act(() => result.current.undo());
    expect(result.current.steps[1].text).toBe('');
  });

  it('drops a queued deletion when its edit is undone, and restores it on redo', async () => {
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    const deleteDriveFile = vi.fn().mockResolvedValue(undefined);
    const { result } = renderEditor();
    act(() => {
      result.current.setSteps((prev) => prev.slice(0, 2));
      result.current.queueMediaDeletion({
        storagePath: 'narration/s2.mp3',
      });
    });
    act(() => result.current.undo());
    await act(() =>
      result.current.flushMediaDeletions(
        releaseVia(deleteFile, deleteDriveFile)
      )
    );
    expect(deleteFile).not.toHaveBeenCalled();

    act(() => result.current.redo());
    await act(() =>
      result.current.flushMediaDeletions(
        releaseVia(deleteFile, deleteDriveFile)
      )
    );
    expect(deleteFile).toHaveBeenCalledWith('narration/s2.mp3');
    await act(() =>
      result.current.flushMediaDeletions(
        releaseVia(deleteFile, deleteDriveFile)
      )
    );
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });

  it('deletes a queued Drive file through the Drive helper', async () => {
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    const deleteDriveFile = vi.fn().mockResolvedValue(undefined);
    const { result } = renderEditor();
    act(() => {
      result.current.setTitle('Blurred');
      result.current.queueMediaDeletion({ driveFileId: 'drive-1' });
    });
    await act(() =>
      result.current.flushMediaDeletions(
        releaseVia(deleteFile, deleteDriveFile)
      )
    );
    expect(deleteDriveFile).toHaveBeenCalledWith('drive-1');
    expect(deleteFile).not.toHaveBeenCalled();
  });

  describe('deleting a slide', () => {
    const storageUrl = (path: string) =>
      `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(path)}?alt=media&token=t`;
    const SLIDE = 'users/teacher-1/hotspot_images/1-b.webp';
    const THUMB = 'users/teacher-1/hotspot_images/thumbs/1-b.webp';
    const slideSet = () =>
      makeSet({
        imageUrls: [
          'https://lh3.googleusercontent.com/d/drive-a',
          storageUrl(SLIDE),
        ],
        steps: [step('s0', 0), step('s1', 1)],
        slideThumbnails: { [storageUrl(SLIDE)]: storageUrl(THUMB) },
      });
    const flush = async (
      result: { current: ReturnType<typeof useGuidedLearningEditorState> },
      release: ReturnType<typeof vi.fn>
    ) => {
      await act(() => result.current.flushMediaDeletions(release));
    };

    it('queues the slide and its thumbnail for release after save-and-close', async () => {
      const release = vi.fn().mockResolvedValue(undefined);
      const { result } = renderEditor(slideSet());
      act(() => result.current.deleteImage(1));
      await flush(result, release);
      expect(release).toHaveBeenCalledExactlyOnceWith({
        storagePaths: [SLIDE, THUMB],
        driveFileIds: [],
      });
    });

    it('releases nothing after the delete is undone', async () => {
      const release = vi.fn().mockResolvedValue(undefined);
      const { result } = renderEditor(slideSet());
      act(() => result.current.deleteImage(0));
      act(() => result.current.undo());
      expect(result.current.imageUrls).toHaveLength(2);
      await flush(result, release);
      expect(release).not.toHaveBeenCalled();
    });

    it('queues a Drive slide by its file id', async () => {
      const release = vi.fn().mockResolvedValue(undefined);
      const { result } = renderEditor(slideSet());
      act(() => result.current.deleteImage(0));
      await flush(result, release);
      expect(release).toHaveBeenCalledWith({
        storagePaths: [],
        driveFileIds: ['drive-a'],
      });
    });

    it('keeps a file the set still shows elsewhere', async () => {
      const release = vi.fn().mockResolvedValue(undefined);
      const set = slideSet();
      const { result } = renderEditor({
        ...set,
        imageUrls: [...set.imageUrls, set.imageUrls[1]],
        steps: [...set.steps, step('s2', 2)],
      });
      act(() => result.current.deleteImage(1));
      await flush(result, release);
      expect(release).not.toHaveBeenCalled();
    });
  });

  it('forgets history and queued deletions when the set changes', async () => {
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderEditor();
    act(() => {
      result.current.setTitle('Edited');
      result.current.queueMediaDeletion({ storagePath: 'x.png' });
    });
    rerender({ existingSet: makeSet({ id: 'set-2', title: 'Other' }) });
    expect(result.current.title).toBe('Other');
    expect(result.current.canUndo).toBe(false);
    await act(() =>
      result.current.flushMediaDeletions(releaseVia(deleteFile, vi.fn()))
    );
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('keeps undo history through the load-time radius conversion', () => {
    const { result } = renderEditor(makeSet({ schemaVersion: 1 }));
    act(() => result.current.setTitle('Edited'));
    act(() =>
      result.current.markSpotlightRadiiV2((steps) =>
        steps.map((s) => ({ ...s, spotlightRadius: 5 }))
      )
    );
    expect(result.current.spotlightRadiiV2).toBe(true);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.steps[0].spotlightRadius).toBe(5);
    act(() => result.current.undo());
    expect(result.current.title).not.toBe('Edited');
    expect(result.current.steps[0].spotlightRadius).toBe(5);
    act(() => result.current.redo());
    expect(result.current.title).toBe('Edited');
  });

  it('drops only the history the conversion cannot rewrite', () => {
    const { result } = renderEditor(makeSet({ schemaVersion: 1 }));
    act(() => result.current.setTitle('First'));
    act(() => result.current.setMode('guided'));
    let calls = 0;
    act(() =>
      result.current.markSpotlightRadiiV2((steps) => {
        calls += 1;
        // present and the newest past entry convert; the oldest does not
        return calls <= 2 ? steps : null;
      })
    );
    act(() => result.current.undo());
    expect(result.current.title).toBe('First');
    expect(result.current.mode).not.toBe('guided');
    expect(result.current.canUndo).toBe(false);
  });
});

describe('slide and step reordering', () => {
  it('reorders slides in one undoable entry and keeps steps on their slides', () => {
    const { result } = renderEditor();
    act(() => result.current.setCurrentImageIndex(0));
    act(() => result.current.reorderImages([2, 0, 1]));
    expect(result.current.imageUrls).toEqual(['c.png', 'a.png', 'b.png']);
    expect(result.current.steps.map((s) => [s.id, s.imageIndex])).toEqual([
      ['s0', 1],
      ['s1', 2],
      ['s2', 0],
    ]);
    expect(result.current.currentImageIndex).toBe(1);
    act(() => result.current.undo());
    expect(result.current.imageUrls).toEqual(['a.png', 'b.png', 'c.png']);
    expect(result.current.steps.map((s) => s.imageIndex)).toEqual([0, 1, 2]);
    expect(result.current.canUndo).toBe(false);
  });

  it('ignores a slide order of the wrong length', () => {
    const { result } = renderEditor();
    act(() => result.current.reorderImages([1, 0]));
    expect(result.current.imageUrls).toEqual(['a.png', 'b.png', 'c.png']);
    expect(result.current.canUndo).toBe(false);
  });
});
