import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { useGuidedLearningEditorState } from './useGuidedLearningEditorState';
import {
  STEP_CLIPBOARD_KEY,
  resetStepClipboardForTests,
  writeStepClipboard,
} from './studio/stepClipboard';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));

const storageUrl = (name: string) =>
  `https://firebasestorage.googleapis.com/v0/b/b/o/users%2Fteacher-1%2Fhotspot_images%2F${name}?alt=media&token=t`;
const SLIDE_A = storageUrl('a.webp');
const SLIDE_B = storageUrl('b.webp');
const REDACTED = storageUrl('redacted.webp');

const storage = vi.hoisted(() => ({
  uploadGuidedLearningImage: vi.fn(),
  uploadGuidedLearningMedia: vi.fn(),
  deleteFile: vi.fn(),
  deleteDriveFile: vi.fn(),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploading: false, ...storage }),
}));
vi.mock('@/utils/guidedLearningMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/guidedLearningMedia')>()),
  prepareImageForUpload: (file: File) => Promise.resolve(file),
}));

const step = (
  id: string,
  imageIndex: number,
  extra: Partial<GuidedLearningStep> = {}
): GuidedLearningStep => ({
  id,
  xPct: 10,
  yPct: 20,
  imageIndex,
  interactionType: 'text-popover',
  text: `text ${id}`,
  ...extra,
});

const makeSet = (
  extra: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Set one',
  imageUrls: [SLIDE_A, SLIDE_B],
  // Slide 0 is revisited late in play order.
  steps: [step('s1', 0), step('s2', 0), step('s3', 1), step('s4', 0)],
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
  isBuilding: true,
  ...extra,
});

const renderEditor = (set: GuidedLearningSet = makeSet()) =>
  renderHook(() =>
    useGuidedLearningEditorState({
      existingSet: set,
      existingMeta: null,
      setWideTimeline: true,
    })
  );

const flush = async (ctl: {
  flushMediaDeletions: (
    release: (files: {
      storagePaths: string[];
      driveFileIds: string[];
    }) => Promise<void>
  ) => Promise<void>;
}) => {
  const deleteFile = vi.fn().mockResolvedValue(undefined);
  const deleteDriveFile = vi.fn().mockResolvedValue(undefined);
  await act(() =>
    ctl.flushMediaDeletions(async ({ storagePaths, driveFileIds }) => {
      await Promise.all([
        ...storagePaths.map((p) => deleteFile(p) as Promise<void>),
        ...driveFileIds.map((id) => deleteDriveFile(id) as Promise<void>),
      ]);
    })
  );
  return { deleteFile, deleteDriveFile };
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  resetStepClipboardForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('duplicate step', () => {
  it('places a copy with a new id right after it, selects it, and undoes in one step', () => {
    const { result } = renderEditor();
    act(() => result.current.duplicateStep('s2'));
    const ids = result.current.steps.map((s) => s.id);
    expect(ids).toHaveLength(5);
    const copy = result.current.steps[2];
    expect(ids.slice(0, 2)).toEqual(['s1', 's2']);
    expect(ids.slice(3)).toEqual(['s3', 's4']);
    expect(copy.id).not.toBe('s2');
    expect({ ...copy, id: 's2' }).toEqual(step('s2', 0));
    expect(result.current.selectedStepId).toBe(copy.id);

    act(() => result.current.undo());
    expect(result.current.steps.map((s) => s.id)).toEqual([
      's1',
      's2',
      's3',
      's4',
    ]);
    expect(result.current.canUndo).toBe(false);
  });

  it('never shares nested objects with the original', () => {
    const { result } = renderEditor(
      makeSet({
        steps: [
          step('s1', 0, { region: { shape: 'rect', wPct: 10, hPct: 10 } }),
        ],
      })
    );
    act(() => result.current.duplicateStep('s1'));
    const [original, copy] = result.current.steps;
    expect(copy.region).toEqual(original.region);
    expect(copy.region).not.toBe(original.region);
  });
});

describe('duplicate slide', () => {
  it('inserts the slide after itself with copies of its steps, in one undo entry', () => {
    const { result } = renderEditor();
    act(() => result.current.duplicateSlide(0));
    const { imageUrls, steps, currentImageIndex } = result.current;
    expect(imageUrls).toEqual([SLIDE_A, SLIDE_A, SLIDE_B]);
    expect(currentImageIndex).toBe(1);
    // The later slide's steps shift; the copies play right after the original's last step.
    expect(
      steps.map((s) => [s.id.length > 3 ? 'copy' : s.id, s.imageIndex])
    ).toEqual([
      ['s1', 0],
      ['s2', 0],
      ['s3', 2],
      ['s4', 0],
      ['copy', 1],
      ['copy', 1],
      ['copy', 1],
    ]);
    const copies = steps.filter((s) => s.imageIndex === 1);
    expect(copies.map((s) => s.text)).toEqual([
      'text s1',
      'text s2',
      'text s4',
    ]);
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);

    act(() => result.current.undo());
    expect(result.current.imageUrls).toEqual([SLIDE_A, SLIDE_B]);
    expect(result.current.steps).toEqual(makeSet().steps);
    expect(result.current.canUndo).toBe(false);
  });

  it('never queues the shared file when the duplicate is deleted', async () => {
    const { result } = renderEditor();
    act(() => result.current.duplicateSlide(0));
    act(() => result.current.deleteImage(1));
    expect(result.current.imageUrls).toEqual([SLIDE_A, SLIDE_B]);
    const { deleteFile, deleteDriveFile } = await flush(result.current);
    expect(deleteFile).not.toHaveBeenCalled();
    expect(deleteDriveFile).not.toHaveBeenCalled();
  });

  it('deletes a redacted duplicate’s old file only once no slide shows it', async () => {
    storage.uploadGuidedLearningImage.mockResolvedValue({ url: REDACTED });
    const { result } = renderEditor();
    act(() => result.current.duplicateSlide(0));
    await act(async () => {
      await result.current.replaceSlideImage(
        1,
        new Blob(['x'], { type: 'image/webp' })
      );
    });
    // Only the duplicate is redacted; the original keeps the shared image.
    expect(result.current.imageUrls).toEqual([SLIDE_A, REDACTED, SLIDE_B]);
    act(() => result.current.deleteImage(0));
    expect(result.current.imageUrls).toEqual([REDACTED, SLIDE_B]);
    const { deleteFile } = await flush(result.current);
    // The redaction replaced the last slide using the file, so only now is it owed.
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith(
      'users/teacher-1/hotspot_images/a.webp'
    );
  });

  it('keeps the shared file while any slide still shows it', async () => {
    storage.uploadGuidedLearningImage.mockResolvedValue({ url: REDACTED });
    const { result } = renderEditor();
    act(() => result.current.duplicateSlide(0));
    await act(async () => {
      await result.current.replaceSlideImage(
        1,
        new Blob(['x'], { type: 'image/webp' })
      );
    });
    const { deleteFile } = await flush(result.current);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('keeps a narration take a duplicated step still plays', async () => {
    storage.uploadGuidedLearningMedia.mockResolvedValue({
      url: storageUrl('take.webm'),
      storagePath: 'users/teacher-1/take.webm',
    });
    const { result } = renderEditor();
    let take = { url: '', storagePath: '' };
    await act(async () => {
      take = await result.current.uploadNarrationTake(
        new Blob(['a']),
        'audio/webm'
      );
    });
    act(() =>
      result.current.setStepNarration('s1', {
        source: 'recorded',
        durationMs: 1000,
        ...take,
      })
    );
    act(() => result.current.duplicateStep('s1'));
    const copyId = result.current.steps[1].id;
    act(() => result.current.setStepNarration(copyId, undefined));
    const { deleteFile } = await flush(result.current);
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

describe('copy and paste steps', () => {
  it('pastes into a second set with new ids on its current slide, as one undo entry', () => {
    const first = renderEditor();
    expect(first.result.current.copySteps(['s4', 's2'])).toBe(2);

    const second = renderEditor(
      makeSet({
        id: 'set-2',
        imageUrls: [SLIDE_B, SLIDE_A],
        steps: [step('t1', 0), step('t2', 1), step('t3', 0)],
      })
    );
    expect(second.result.current.clipboardStepCount).toBe(2);
    act(() => second.result.current.setCurrentImageIndex(0));
    act(() => {
      expect(second.result.current.pasteSteps()).toBe(2);
    });
    const { steps } = second.result.current;
    // Copied in play order, and inserted after slide 1's last step.
    expect(steps.map((s) => s.text)).toEqual([
      'text t1',
      'text t2',
      'text t3',
      'text s2',
      'text s4',
    ]);
    expect(steps.slice(3).every((s) => s.imageIndex === 0)).toBe(true);
    expect(steps.slice(3).some((s) => ['s2', 's4'].includes(s.id))).toBe(false);
    expect(second.result.current.selectedStepId).toBe(steps[4].id);

    act(() => second.result.current.undo());
    expect(second.result.current.steps.map((s) => s.id)).toEqual([
      't1',
      't2',
      't3',
    ]);
    expect(second.result.current.canUndo).toBe(false);
  });

  it('pastes onto the slide it is given', () => {
    const { result } = renderEditor();
    result.current.copySteps(['s1']);
    act(() => {
      result.current.pasteSteps(1);
    });
    expect(result.current.currentImageIndex).toBe(1);
    const pasted = result.current.steps.find(
      (s) => s.id === result.current.selectedStepId
    );
    expect(pasted?.imageIndex).toBe(1);
    expect(pasted?.text).toBe('text s1');
  });

  it('survives a reload through sessionStorage', () => {
    renderEditor().result.current.copySteps(['s3']);
    expect(window.sessionStorage.getItem(STEP_CLIPBOARD_KEY)).toContain('s3');
    resetStepClipboardForTests();
    const { result } = renderEditor(makeSet({ id: 'set-3', steps: [] }));
    act(() => {
      expect(result.current.pasteSteps()).toBe(1);
    });
    expect(result.current.steps[0].text).toBe('text s3');
  });

  it('still pastes in this tab when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderEditor();
    expect(() => result.current.copySteps(['s1'])).not.toThrow();
    act(() => {
      expect(result.current.pasteSteps()).toBe(1);
    });
    resetStepClipboardForTests();
    expect(renderEditor().result.current.clipboardStepCount).toBe(0);
  });

  it('ignores a malformed clipboard', () => {
    window.sessionStorage.setItem(STEP_CLIPBOARD_KEY, '[{"id":1}]');
    const { result } = renderEditor();
    expect(result.current.clipboardStepCount).toBe(0);
    act(() => {
      expect(result.current.pasteSteps()).toBe(0);
    });
    expect(result.current.canUndo).toBe(false);
  });

  it('updates the count in every open editor when something is copied', () => {
    const { result } = renderEditor();
    expect(result.current.clipboardStepCount).toBe(0);
    act(() => writeStepClipboard([step('x', 0)]));
    expect(result.current.clipboardStepCount).toBe(1);
  });

  it('never deletes a take this session recorded once it is copied to another set', async () => {
    storage.uploadGuidedLearningMedia.mockResolvedValue({
      url: storageUrl('take.webm'),
      storagePath: 'users/teacher-1/take.webm',
    });
    const { result } = renderEditor();
    let take = { url: '', storagePath: '' };
    await act(async () => {
      take = await result.current.uploadNarrationTake(
        new Blob(['a']),
        'audio/webm'
      );
    });
    act(() =>
      result.current.setStepNarration('s1', {
        source: 'recorded',
        durationMs: 1000,
        ...take,
      })
    );
    result.current.copySteps(['s1']);
    act(() => result.current.setStepNarration('s1', undefined));
    const { deleteFile } = await flush(result.current);
    expect(deleteFile).not.toHaveBeenCalled();
  });
});
