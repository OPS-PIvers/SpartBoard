import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import React from 'react';
import { AnnotationOverlay } from '@/components/layout/AnnotationOverlay';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { toPng } from 'html-to-image';
import type {
  AnnotationState,
  DashboardContextValue,
} from '@/context/DashboardContextValue';
import type { DrawableObject, TextObject } from '@/types';

// Mock the auth and dashboard contexts. Both are accessed as plain hooks by
// AnnotationOverlay, so vi.mock + vi.mocked is the standard pattern (mirrors
// the approach used by BoardActionsFab.test and DashboardView.test).
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
const { mockSaveDrawingToDrive, mockIsDriveConnected } = vi.hoisted(() => ({
  mockSaveDrawingToDrive: vi.fn(),
  mockIsDriveConnected: { current: false },
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    isConnected: mockIsDriveConnected.current,
    saveDrawingToDrive: mockSaveDrawingToDrive,
  }),
}));
// html-to-image is only used by handlers we don't exercise here — stub so the
// import doesn't load its canvas-heavy module graph under jsdom.
vi.mock('html-to-image', () => ({ toPng: vi.fn().mockResolvedValue('') }));

// Controllable getLocalIsoDate for the UTC/local-date-divergence regression
// test below — see the matching mock in DraggableWindow.test.tsx for the
// same pattern and rationale (TZ is pinned to 'UTC' in this test env, so real
// local getters can never diverge from toISOString(); the helper itself must
// be mocked to simulate what a non-UTC teacher would see).
const {
  mockGetLocalIsoDate,
  defaultGetLocalIsoDate,
  mockGetLocalTimestampForFilename,
  defaultGetLocalTimestampForFilename,
} = vi.hoisted(() => ({
  mockGetLocalIsoDate: vi.fn<() => string>(),
  defaultGetLocalIsoDate: { current: (() => '') as () => string },
  mockGetLocalTimestampForFilename: vi.fn<() => string>(),
  defaultGetLocalTimestampForFilename: { current: (() => '') as () => string },
}));

vi.mock('@/utils/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/localDate')>();
  defaultGetLocalIsoDate.current = actual.getLocalIsoDate;
  mockGetLocalIsoDate.mockImplementation(actual.getLocalIsoDate);
  defaultGetLocalTimestampForFilename.current =
    actual.getLocalTimestampForFilename;
  mockGetLocalTimestampForFilename.mockImplementation(
    actual.getLocalTimestampForFilename
  );
  return {
    ...actual,
    getLocalIsoDate: mockGetLocalIsoDate,
    getLocalTimestampForFilename: mockGetLocalTimestampForFilename,
  };
});
// The image-insertion hook does its own I/O; stub it so the overlay mounts
// cleanly without needing a Firebase auth user or storage upload pipeline.
vi.mock('@/components/widgets/DrawingWidget/useImageInsertion', () => ({
  useImageInsertion: () => ({
    openPicker: vi.fn(),
    fileInputProps: {
      ref: { current: null },
      type: 'file' as const,
      accept: 'image/*' as const,
      onChange: vi.fn(),
      className: 'hidden' as const,
      'aria-hidden': true as const,
      tabIndex: -1 as const,
    },
    handlePaste: vi.fn(),
    handleNativePaste: vi.fn(),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
    isUploading: false,
  }),
}));

const baseState = (
  overrides: Partial<AnnotationState> = {}
): AnnotationState => ({
  objects: [],
  color: '#000000',
  width: 4,
  customColors: ['#000000', '#ff0000', '#00ff00', '#0000ff'],
  activeTool: 'pen',
  shapeFill: false,
  ...overrides,
});

interface ContextOverrides {
  annotationState?: AnnotationState;
  annotationActive?: boolean;
  isActiveBoardReadOnly?: boolean;
}

const setupContext = (overrides: ContextOverrides = {}) => {
  const removeAnnotationObject = vi.fn();
  const addAnnotationObject = vi.fn();
  const updateAnnotationState = vi.fn();
  const closeAnnotation = vi.fn();
  const undoAnnotation = vi.fn();
  const redoAnnotation = vi.fn();
  const clearAnnotation = vi.fn();
  const updateWidget = vi.fn();
  const addWidget = vi.fn();
  const addToast = vi.fn();

  (useDashboard as Mock).mockReturnValue({
    annotationActive: overrides.annotationActive ?? true,
    annotationState: overrides.annotationState ?? baseState(),
    isActiveBoardReadOnly: overrides.isActiveBoardReadOnly ?? false,
    canRedoAnnotation: false,
    activeDashboard: { id: 'b1', widgets: [] },
    closeAnnotation,
    updateAnnotationState,
    addAnnotationObject,
    updateAnnotationObject: vi.fn(),
    removeAnnotationObject,
    undoAnnotation,
    redoAnnotation,
    clearAnnotation,
    updateWidget,
    addWidget,
    addToast,
  } as unknown as DashboardContextValue);

  (useAuth as Mock).mockReturnValue({
    canAccessFeature: () => false,
  });

  return {
    removeAnnotationObject,
    addAnnotationObject,
    updateAnnotationState,
    closeAnnotation,
  };
};

describe('AnnotationOverlay', () => {
  beforeEach(() => {
    // The component portals into `#dashboard-root` — ensure the node exists
    // for every test (re-created since each test resets document.body).
    const root = document.createElement('div');
    root.id = 'dashboard-root';
    document.body.appendChild(root);
    // Default: getLocalIsoDate returns the real local date so existing tests
    // (which don't care about the download filename) are unaffected.
    mockGetLocalIsoDate.mockReset();
    mockGetLocalIsoDate.mockImplementation(defaultGetLocalIsoDate.current);
    mockGetLocalTimestampForFilename.mockReset();
    mockGetLocalTimestampForFilename.mockImplementation(
      defaultGetLocalTimestampForFilename.current
    );
    mockSaveDrawingToDrive.mockReset();
    mockSaveDrawingToDrive.mockResolvedValue(undefined);
    mockIsDriveConnected.current = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('tool buttons use aria-pressed (toggle-button group, not radiogroup)', () => {
    setupContext({ annotationState: baseState({ activeTool: 'arrow' }) });
    const { getByLabelText, container } = render(<AnnotationOverlay />);
    // The active tool's button is aria-pressed=true; others false.
    expect(getByLabelText('Arrow')).toHaveAttribute('aria-pressed', 'true');
    expect(getByLabelText('Pen')).toHaveAttribute('aria-pressed', 'false');
    expect(getByLabelText('Select')).toHaveAttribute('aria-pressed', 'false');
    // No leftover radio-pattern attributes anywhere in the toolbar.
    expect(container.querySelector('[role="radio"]')).toBeNull();
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(getByLabelText('Arrow')).not.toHaveAttribute('aria-checked');
  });

  it('clicking a tool button calls updateAnnotationState with the new tool', () => {
    const { updateAnnotationState } = setupContext();
    const { getByLabelText } = render(<AnnotationOverlay />);
    fireEvent.click(getByLabelText('Rectangle'));
    expect(updateAnnotationState).toHaveBeenCalledWith({ activeTool: 'rect' });
  });

  it('empty re-edit of an existing TextObject routes through removeAnnotationObject', async () => {
    // Spec: when an existing text annotation is re-edited to an empty value,
    // the overlay calls `removeAnnotationObject(id)` (NOT `updateAnnotationState`
    // with a replaced array) so the per-author undo stack stays aligned with
    // every other "object removed" path.
    const existing: TextObject = {
      id: 'txt-erase-me',
      kind: 'text',
      z: 1,
      x: 100,
      y: 100,
      w: 200,
      h: 40,
      content: 'goodbye',
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#000',
    };
    const objects: DrawableObject[] = [existing];
    const {
      removeAnnotationObject,
      addAnnotationObject,
      updateAnnotationState,
    } = setupContext({
      annotationState: baseState({ activeTool: 'select', objects }),
    });

    // Stub getBoundingClientRect on the canvas so the double-click hit-test
    // resolves to the existing TextObject. We also force the canvas's
    // internal resolution to match: useDrawingCanvas's resize effect doesn't
    // re-run after the portalTarget mount-time re-render in jsdom (its deps
    // don't change between renders), so without this override the canvas
    // would keep its default 300x150 and `scaleX = canvas.width / rect.width`
    // would translate `clientX=150` to `px=44`, missing the bbox.
    const VIEWPORT_W = 1024;
    const VIEWPORT_H = 768;
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getBoundingClientRect'
    ).mockReturnValue({
      left: 0,
      top: 0,
      width: VIEWPORT_W,
      height: VIEWPORT_H,
      right: VIEWPORT_W,
      bottom: VIEWPORT_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(<AnnotationOverlay />);
    // The overlay portals into `#dashboard-root`, so the canvas lives in
    // document.body's tree rather than the testing-library container.
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');
    // Force internal resolution to match the mocked rect so scaleX === 1.
    canvas.width = VIEWPORT_W;
    canvas.height = VIEWPORT_H;

    // Double-click inside the existing text's bbox to open the editor.
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 110 });
    // The editor mounts via a `canvasRect` useEffect chained off
    // `setEditingText` — wait for it to land in the DOM before keying input.
    const editor = (await waitFor(() => {
      const node = document.querySelector('[role="textbox"]');
      if (!node) throw new Error('Editor not yet mounted');
      return node;
    })) as HTMLElement;

    // Erase the content and commit via Cmd+Enter.
    editor.innerText = '';
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });

    // The remove path is taken — NOT the bulk-replace path. This is the
    // explicit fix the spec calls for: an empty commit on an existing
    // TextObject must use the dedicated remove mutator so the per-author
    // undo logic stays consistent.
    expect(removeAnnotationObject).toHaveBeenCalledTimes(1);
    expect(removeAnnotationObject).toHaveBeenCalledWith('txt-erase-me');
    expect(updateAnnotationState).not.toHaveBeenCalled();
    expect(addAnnotationObject).not.toHaveBeenCalled();
  });

  // Asserts ordering only: closeAnnotation still wipes objects until the
  // per-board persistence change lands, so this is the hook it relies on.
  it('REGRESSION: Exit commits an open text edit instead of dropping it', async () => {
    const existing: TextObject = {
      id: 'txt-open',
      kind: 'text',
      z: 1,
      x: 100,
      y: 100,
      w: 200,
      h: 40,
      content: 'before',
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#000',
    };
    const { updateAnnotationState, closeAnnotation } = setupContext({
      annotationState: baseState({ activeTool: 'select', objects: [existing] }),
    });
    const VIEWPORT_W = 1024;
    const VIEWPORT_H = 768;
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getBoundingClientRect'
    ).mockReturnValue({
      left: 0,
      top: 0,
      width: VIEWPORT_W,
      height: VIEWPORT_H,
      right: VIEWPORT_W,
      bottom: VIEWPORT_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(<AnnotationOverlay />);
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');
    canvas.width = VIEWPORT_W;
    canvas.height = VIEWPORT_H;
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 110 });
    const editor = (await waitFor(() => {
      const node = document.querySelector('[role="textbox"]');
      if (!node) throw new Error('Editor not yet mounted');
      return node;
    })) as HTMLElement;
    editor.innerText = 'after';

    fireEvent.click(screen.getByRole('button', { name: /^exit/i }));

    expect(updateAnnotationState).toHaveBeenCalledTimes(1);
    const { objects } = updateAnnotationState.mock.calls[0][0] as {
      objects: TextObject[];
    };
    expect(objects[0].content).toBe('after');
    expect(closeAnnotation).toHaveBeenCalledTimes(1);
  });

  // Regression: the "Download PNG" filename was built from
  // `new Date().toISOString().split('T')[0]` — the UTC calendar date —
  // instead of the teacher's local date. For every timezone west of UTC (all
  // of the Americas), the last few hours of the local day fall on the *next*
  // UTC date, so an annotation downloaded in the evening gets tomorrow's date
  // baked into the filename. Fix: use the shared `getLocalIsoDate()` helper
  // (utils/localDate.ts).
  it('REGRESSION: downloaded annotation filename uses the local date, not the UTC date', async () => {
    setupContext();
    (toPng as Mock).mockResolvedValueOnce('data:image/png;base64,abc');
    // A teacher in a UTC-negative zone in the evening: their local calendar
    // date has not yet caught up to UTC's. getLocalIsoDate is mocked directly
    // (rather than the system clock) so the assertion below is deterministic
    // regardless of when this suite actually runs.
    mockGetLocalIsoDate.mockReturnValue('2026-03-05');

    const anchors: HTMLAnchorElement[] = [];
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreateElement(tag);
      if (tag === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    });

    const { getByTitle } = render(<AnnotationOverlay />);
    fireEvent.click(getByTitle('Download PNG'));

    await waitFor(() => {
      expect(anchors.length).toBeGreaterThan(0);
    });

    // BUG: toISOString-based code names the file after today's real UTC date,
    // not the mocked local date — this assertion fails on the pre-fix
    // implementation and passes once the filename is sourced from
    // getLocalIsoDate().
    expect(anchors[0].download).toBe('Annotation-2026-03-05.png');
  });

  // Regression: Drive-saved filenames used a raw toISOString() UTC timestamp instead of local time.
  it('REGRESSION: Drive-saved annotation filename uses the local timestamp, not the UTC one', async () => {
    mockIsDriveConnected.current = true;
    setupContext();
    (toPng as Mock).mockResolvedValueOnce('data:image/png;base64,abc');
    mockGetLocalTimestampForFilename.mockReturnValue('2026-03-05T20-15-30');
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['x'])),
    } as unknown as Response);

    const { getByTitle } = render(<AnnotationOverlay />);
    fireEvent.click(getByTitle('Save to Google Drive'));

    await waitFor(() => {
      expect(mockSaveDrawingToDrive).toHaveBeenCalledTimes(1);
    });

    expect(mockSaveDrawingToDrive).toHaveBeenCalledWith(
      expect.any(Blob),
      'Annotation-2026-03-05T20-15-30.png'
    );
  });
});
