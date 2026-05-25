import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AnnotationOverlay } from '@/components/layout/AnnotationOverlay';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
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
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    isConnected: false,
    saveDrawingToDrive: vi.fn(),
  }),
}));
// html-to-image is only used by handlers we don't exercise here — stub so the
// import doesn't load its canvas-heavy module graph under jsdom.
vi.mock('html-to-image', () => ({ toPng: vi.fn().mockResolvedValue('') }));
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
});
