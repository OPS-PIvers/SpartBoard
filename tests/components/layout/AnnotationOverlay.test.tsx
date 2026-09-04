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
import { getAnnotationWorldRect } from '@/utils/annotationSize';
import { ZOOM_MIN } from '@/utils/zoomMapping';
import { Z_INDEX } from '@/config/zIndex';
import i18n from '@/i18n';

// Mock the auth and dashboard contexts. Both are accessed as plain hooks by
// AnnotationOverlay, so vi.mock + vi.mocked is the standard pattern (mirrors
// the approach used by BoardActionsFab.test and DashboardView.test).
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
const { mockShowConfirm } = vi.hoisted(() => ({
  mockShowConfirm:
    vi.fn<
      (
        message: string,
        options?: { title?: string; variant?: string; confirmLabel?: string }
      ) => Promise<boolean>
    >(),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: mockShowConfirm }),
}));
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
  canUndoAnnotation?: boolean;
  /** What the shared-objects writers report back (false = refused by the cap). */
  writesAccepted?: boolean;
  zoom?: number;
  reportAnnotationCanvasSize?: (
    size: { width: number; height: number } | null
  ) => void;
}

const setWindowSize = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    writable: true,
    configurable: true,
  });
};

const setupContext = (overrides: ContextOverrides = {}) => {
  const accepted = overrides.writesAccepted ?? true;
  const removeAnnotationObject = vi.fn();
  const addAnnotationObject = vi.fn().mockReturnValue(accepted);
  const updateAnnotationState = vi.fn().mockReturnValue(accepted);
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
    canUndoAnnotation: overrides.canUndoAnnotation ?? true,
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
    zoom: overrides.zoom ?? 1,
    reportAnnotationCanvasSize: overrides.reportAnnotationCanvasSize ?? vi.fn(),
  } as unknown as DashboardContextValue);

  (useAuth as Mock).mockReturnValue({
    canAccessFeature: () => false,
  });

  return {
    removeAnnotationObject,
    addAnnotationObject,
    updateAnnotationState,
    closeAnnotation,
    clearAnnotation,
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

  // Regression: a text commit refused by the size cap still closed the editor,
  // throwing away everything the teacher had just typed.
  it('REGRESSION: a refused text commit keeps the editor open', async () => {
    const existing: TextObject = {
      id: 'txt-refused',
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
    const { updateAnnotationState } = setupContext({
      annotationState: baseState({ activeTool: 'select', objects: [existing] }),
      writesAccepted: false,
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
    editor.innerText = 'typed but refused';
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });

    expect(updateAnnotationState).toHaveBeenCalledTimes(1);
    // The editor survives the refusal so the text can be trimmed and retried.
    expect(document.querySelector('[role="textbox"]')).not.toBeNull();
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

describe('AnnotationOverlay — persistence + layout', () => {
  beforeEach(() => {
    const root = document.createElement('div');
    root.id = 'dashboard-root';
    document.body.appendChild(root);
    mockShowConfirm.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const stroke: DrawableObject = {
    id: 'p1',
    kind: 'rect',
    z: 1,
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    stroke: '#000',
    strokeWidth: 2,
  };

  it('mounts the canvas inside the zoom surface and the toolbar top-center', () => {
    const surface = document.createElement('div');
    surface.id = 'dashboard-zoom-surface';
    const root = document.getElementById('dashboard-root');
    if (!root) throw new Error('dashboard-root missing');
    root.appendChild(surface);
    setupContext();
    render(<AnnotationOverlay />);
    const canvas = document.querySelector('canvas');
    expect(canvas?.parentElement).toBe(surface);
    const toolbar = screen
      .getByRole('button', { name: /^exit/i })
      .closest('[data-screenshot="exclude"]') as HTMLElement;
    expect(toolbar.className).toContain('top-6');
    expect(toolbar.className).not.toContain('bottom-6');
    expect(surface.contains(toolbar)).toBe(false);
  });

  it('trash asks for confirmation and only clears on yes', async () => {
    const clearAnnotation = vi.fn();
    setupContext({ annotationState: baseState({ objects: [stroke] }) });
    (useDashboard as Mock).mockReturnValue({
      ...(useDashboard as Mock)(),
      clearAnnotation,
    });
    render(<AnnotationOverlay />);
    const trash = screen.getByRole('button', { name: /clear all/i });

    mockShowConfirm.mockResolvedValueOnce(false);
    fireEvent.click(trash);
    await waitFor(() => expect(mockShowConfirm).toHaveBeenCalledTimes(1));
    expect(clearAnnotation).not.toHaveBeenCalled();

    mockShowConfirm.mockResolvedValueOnce(true);
    fireEvent.click(trash);
    await waitFor(() => expect(clearAnnotation).toHaveBeenCalledTimes(1));
  });

  // Regression: the canvas moved into `#dashboard-zoom-surface` but stayed
  // sized to the viewport, so at ZOOM_MIN only the central quarter of the
  // screen accepted ink and the outer band fell through to the widgets.
  it('REGRESSION: the canvas covers the world rect, so the viewport edge is inkable at ZOOM_MIN', () => {
    setupContext();
    render(<AnnotationOverlay />);
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const expected = getAnnotationWorldRect(vw, vh);
    expect(canvas.style.left).toBe(`${expected.left}px`);
    expect(canvas.style.top).toBe(`${expected.top}px`);
    expect(canvas.style.width).toBe(`${expected.width}px`);
    expect(canvas.style.height).toBe(`${expected.height}px`);
    expect(canvas.className).not.toContain('inset-0');

    // Apply the zoom surface's `scale(ZOOM_MIN)` about its center and confirm
    // the rendered canvas still spans the whole viewport.
    const toScreen = (coord: number, size: number) =>
      size / 2 + (coord - size / 2) * ZOOM_MIN;
    expect(toScreen(expected.left, vw)).toBeLessThanOrEqual(0);
    expect(toScreen(expected.left + expected.width, vw)).toBeGreaterThanOrEqual(
      vw
    );
    expect(toScreen(expected.top, vh)).toBeLessThanOrEqual(0);
    expect(toScreen(expected.top + expected.height, vh)).toBeGreaterThanOrEqual(
      vh
    );
  });

  // Regression: ink stored in raw viewport pixels clipped and drifted when the
  // board was reopened on a projector. The canvas now renders at the authored
  // resolution and the browser scales it into the world-rect box.
  it('REGRESSION: renders at the authored canvas resolution, not the current one', () => {
    setupContext({
      annotationState: baseState({
        objects: [stroke],
        canvasWidth: 640,
        canvasHeight: 480,
      }),
    });
    render(<AnnotationOverlay />);
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    // The CSS box still fills the world rect, so the ink scales to fit it.
    const expected = getAnnotationWorldRect(
      window.innerWidth,
      window.innerHeight
    );
    expect(canvas.style.width).toBe(`${expected.width}px`);
  });

  // Regression: the destructive button autofocused, so Enter wiped the board.
  it('REGRESSION: the clear-all confirm is a danger dialog', async () => {
    setupContext({ annotationState: baseState({ objects: [stroke] }) });
    mockShowConfirm.mockResolvedValueOnce(false);
    render(<AnnotationOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    await waitFor(() => expect(mockShowConfirm).toHaveBeenCalledTimes(1));
    expect(mockShowConfirm.mock.calls[0][1]).toMatchObject({
      variant: 'danger',
      confirmLabel: 'Clear',
    });
  });

  // Regression: Undo was enabled for pre-session ink but is session-scoped, so
  // the click did nothing at all.
  it('REGRESSION: Undo is disabled when the context reports nothing to undo', () => {
    setupContext({
      annotationState: baseState({ objects: [stroke] }),
      canUndoAnnotation: false,
    });
    render(<AnnotationOverlay />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  // Regression: the resize listener was gated on `shouldRender`, so a window
  // resized while the board held no ink left `viewport` at its mount-time
  // value. Opening the pencil then sized the canvas to the OLD world rect —
  // the outer band was un-inkable and the first stroke landed offset.
  it('REGRESSION: a resize while the board held no ink still sizes the canvas to the current window', () => {
    const originalW = window.innerWidth;
    const originalH = window.innerHeight;
    try {
      setupContext({ annotationActive: false });
      const { rerender } = render(<AnnotationOverlay />);
      // Nothing rendered: no toolbar, no ink.
      expect(document.querySelector('canvas')).toBeNull();

      // The teacher resizes (or plugs in a projector) with the overlay gone,
      // so no 'resize' event ever reaches the component.
      setWindowSize(1920, 1080);

      setupContext({ annotationActive: true });
      rerender(<AnnotationOverlay />);

      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('Canvas not found');
      const expected = getAnnotationWorldRect(1920, 1080);
      expect(canvas.style.width).toBe(`${expected.width}px`);
      expect(canvas.style.height).toBe(`${expected.height}px`);
      expect(canvas.style.left).toBe(`${expected.left}px`);
    } finally {
      setWindowSize(originalW, originalH);
    }
  });

  // The stamp written with the ink must be the canvas the ink was drawn into,
  // not a rect the write path re-derives from `window`.
  it('reports the canvas it renders into to the write path', () => {
    const reportAnnotationCanvasSize = vi.fn();
    setupContext({ reportAnnotationCanvasSize });
    const { unmount } = render(<AnnotationOverlay />);

    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');
    expect(reportAnnotationCanvasSize).toHaveBeenCalledWith({
      width: canvas.width,
      height: canvas.height,
    });

    // Unmounting restores the window fallback for programmatic writes.
    reportAnnotationCanvasSize.mockClear();
    unmount();
    expect(reportAnnotationCanvasSize).toHaveBeenCalledWith(null);
  });

  // Regression: `canvasRect` was measured in an effect keyed only on the
  // editing object and the viewport, but the canvas rides the board camera —
  // panning or zooming left the text editor parked at the old screen position.
  it('REGRESSION: the text editor re-measures the canvas when the board pans', async () => {
    const existing: TextObject = {
      id: 'txt-pan',
      kind: 'text',
      z: 1,
      x: 100,
      y: 100,
      w: 200,
      h: 40,
      content: 'hello',
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#000',
    };
    setupContext({
      annotationState: baseState({ activeTool: 'select', objects: [existing] }),
    });
    const VIEWPORT_W = 1024;
    const VIEWPORT_H = 768;
    const rectAt = (left: number): DOMRect =>
      ({
        left,
        top: 0,
        width: VIEWPORT_W,
        height: VIEWPORT_H,
        right: left + VIEWPORT_W,
        bottom: VIEWPORT_H,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const rectSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(rectAt(0));

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
    const before = editor.style.left;

    // DashboardView owns panOffset and announces every pan as `board-pan`.
    rectSpy.mockReturnValue(rectAt(-300));
    fireEvent(window, new CustomEvent('board-pan'));

    await waitFor(() => {
      const node = document.querySelector('[role="textbox"]') as HTMLElement;
      expect(node.style.left).not.toBe(before);
    });
    const after = document.querySelector('[role="textbox"]') as HTMLElement;
    expect(parseFloat(after.style.left)).toBeCloseTo(
      parseFloat(before) - 300,
      1
    );
  });

  // Regression: the ink sat at Z_INDEX.overlay inside the transformed zoom
  // surface, so a maximized widget (Z_INDEX.maximized) painted straight over it.
  it('REGRESSION: the ink canvas outranks a maximized widget inside the zoom surface', () => {
    setupContext();
    render(<AnnotationOverlay />);
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');
    expect(Number(canvas.style.zIndex)).toBeGreaterThan(Z_INDEX.maximized);
  });

  // The toolbar/text-editor portal must stay above the lifted zoom surface.
  it('the toolbar portal outranks the lifted zoom surface', () => {
    setupContext();
    render(<AnnotationOverlay />);
    const portal = screen
      .getByRole('button', { name: /^exit/i })
      .closest('.fixed') as HTMLElement;
    expect(Number(portal.style.zIndex)).toBeGreaterThan(
      Z_INDEX.annotationSurface
    );
  });

  // Regression: a ~1100px toolbar centered at top-6 collided with the fixed
  // Sidebar pill and was clipped by the overflow-hidden portal on 1024px
  // projectors, putting Select and Exit out of reach.
  it('REGRESSION: at 1024px the toolbar clears the sidebar pill and stays reachable', () => {
    const originalW = window.innerWidth;
    const originalH = window.innerHeight;
    try {
      setWindowSize(1024, 768);
      setupContext();
      render(<AnnotationOverlay />);
      const wrapper = screen
        .getByRole('button', { name: /^exit/i })
        .closest('[data-screenshot="exclude"]') as HTMLElement;
      // Offset right of the top-left pill instead of centered on the viewport.
      expect(parseFloat(wrapper.style.left)).toBeGreaterThanOrEqual(300);
      expect(wrapper.className).not.toContain('left-1/2');

      const bar = wrapper.firstElementChild as HTMLElement;
      expect(bar.style.maxWidth).toBe('calc(100vw - 2rem)');
      expect(bar.className).toContain('flex-wrap');

      // Both ends of the toolbar are still present and operable.
      expect(screen.getByLabelText('Select')).toBeEnabled();
      expect(screen.getByRole('button', { name: /^exit/i })).toBeEnabled();
    } finally {
      setWindowSize(originalW, originalH);
    }
  });

  it('centers the toolbar again on a wide projector', () => {
    const originalW = window.innerWidth;
    const originalH = window.innerHeight;
    try {
      setWindowSize(1920, 1080);
      setupContext();
      render(<AnnotationOverlay />);
      const wrapper = screen
        .getByRole('button', { name: /^exit/i })
        .closest('[data-screenshot="exclude"]') as HTMLElement;
      expect(parseFloat(wrapper.style.left)).toBeLessThan(100);
    } finally {
      setWindowSize(originalW, originalH);
    }
  });

  it('explains the inert dock only while a drawing tool is armed', () => {
    setupContext({ annotationState: baseState({ activeTool: 'pen' }) });
    const { unmount } = render(<AnnotationOverlay />);
    expect(
      screen.getByText(i18n.t('annotation.chromeInertHint'))
    ).toBeInTheDocument();
    unmount();

    setupContext({ annotationState: baseState({ activeTool: 'select' }) });
    render(<AnnotationOverlay />);
    expect(screen.queryByText(i18n.t('annotation.chromeInertHint'))).toBeNull();
  });

  // The clear-all confirm was hardcoded English; it now follows the locale.
  it('translates the clear-all confirmation', async () => {
    setupContext({ annotationState: baseState({ objects: [stroke] }) });
    mockShowConfirm.mockResolvedValue(false);
    try {
      await i18n.changeLanguage('de');
      render(<AnnotationOverlay />);
      fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
      await waitFor(() => expect(mockShowConfirm).toHaveBeenCalledTimes(1));
      expect(mockShowConfirm.mock.calls[0][0]).toBe(
        i18n.t('annotation.clearConfirmBody')
      );
      expect(mockShowConfirm.mock.calls[0][0]).not.toContain('Clear all');
      expect(mockShowConfirm.mock.calls[0][1]?.confirmLabel).toBe(
        i18n.t('annotation.clearConfirmAction')
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('with the toolbar closed, persisted ink renders inert and Escape does nothing', () => {
    const { closeAnnotation } = setupContext({
      annotationActive: false,
      annotationState: baseState({ objects: [stroke] }),
    });
    render(<AnnotationOverlay />);
    const canvas = document.querySelector('canvas');
    expect(canvas?.className).toContain('pointer-events-none');
    expect(screen.queryByRole('button', { name: /^exit/i })).toBeNull();
    expect(screen.queryByText(/host annotation/i)).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeAnnotation).not.toHaveBeenCalled();
  });
});
