import { useCallback, useMemo, useRef, useState } from 'react';
import type { GuidedLearningRegion } from '@/types';
import type { DevicePreset, PctPoint, StageGeometry } from '../../types/stage';
import { polygonBBox } from '../../utils/regionGeometry';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';
import type { StudioShortcut } from './useStudioShortcuts';
import type { DrawShape } from './StudioEditLayer';
import { moveStep, removeVertex, setCalloutPin } from './regionEdits';
import { useCanvasViewport } from './useCanvasViewport';
import { fitScale } from './deviceFrameContext';
import { findCallout } from './canvasScale';

/** Arrow nudge in image-%. */
export const NUDGE_PCT = 0.25;
export const NUDGE_SHIFT_PCT = 2;

const CANVAS_SELECTOR = '[data-gl-studio-canvas]';

/** Canvas-scoped keys only fire when focus is on the page or inside the canvas. */
function onCanvas(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return true;
  return target === document.body || target.closest(CANVAS_SELECTOR) !== null;
}

/** Tool state, canvas viewport and shortcut rows for the Studio canvas. */
export function useCanvasTools(
  state: GuidedLearningEditorController,
  preset: DevicePreset
) {
  const {
    steps,
    selectedStepId,
    setSelectedStepId,
    currentImageIndex,
    addingStep,
    setAddingStep,
    addStepAt,
    updateStep,
  } = state;
  const viewport = useCanvasViewport(preset.id);
  const [shape, setShape] = useState<DrawShape>('rect');
  const [draft, setDraft] = useState<PctPoint[] | null>(null);
  const [calloutFocused, setCalloutFocused] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const geometryRef = useRef<StageGeometry | null>(null);
  const onGeometry = useCallback((g: StageGeometry) => {
    geometryRef.current = g;
  }, []);

  const polygonDraft = addingStep && shape === 'polygon' ? draft : null;
  const editingStepId = editing === selectedStepId ? editing : null;
  const slideSteps = useMemo(
    () => steps.filter((s) => s.imageIndex === currentImageIndex),
    [steps, currentImageIndex]
  );
  const selected = slideSteps.find((s) => s.id === selectedStepId) ?? null;

  const chooseTool = useCallback(
    (next: DrawShape | null) => {
      setDraft(null);
      if (next) setShape(next);
      setAddingStep(next !== null);
    },
    [setAddingStep]
  );

  const closePolygon = useCallback(
    (points: PctPoint[]) => {
      setDraft(null);
      if (points.length < 3) return;
      const pts = points.map((p) => ({ x: p.xPct, y: p.yPct }));
      const box = polygonBBox(pts);
      const region: GuidedLearningRegion = {
        shape: 'polygon',
        wPct: box.wPct,
        hPct: box.hPct,
        points: pts,
      };
      addStepAt(box.xPct, box.yPct, region);
    },
    [addStepAt]
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return;
      if (!calloutFocused) {
        updateStep(moveStep(selected, dx, dy));
        return;
      }
      let from = selected.calloutPin ?? null;
      const g = geometryRef.current;
      if (!from && g) {
        const r = findCallout(
          document.querySelector(CANVAS_SELECTOR),
          selected.id
        )?.getBoundingClientRect();
        if (r)
          from = g.clientToImagePct(r.left + r.width / 2, r.top + r.height / 2);
      }
      if (!from) return;
      updateStep(
        setCalloutPin(selected, { xPct: from.xPct + dx, yPct: from.yPct + dy })
      );
    },
    [selected, calloutFocused, updateStep]
  );

  const cycle = useCallback(
    (dir: 1 | -1) => {
      if (slideSteps.length === 0) return;
      const i = slideSteps.findIndex((s) => s.id === selectedStepId);
      const next =
        i < 0
          ? dir === 1
            ? 0
            : slideSteps.length - 1
          : (i + dir + slideSteps.length) % slideSteps.length;
      setCalloutFocused(false);
      setSelectedStepId(slideSteps[next].id);
    },
    [slideSteps, selectedStepId, setSelectedStepId]
  );

  /** Delete on a focused polygon vertex removes that vertex; returns whether it did. */
  const deleteFocusedVertex = useCallback(
    (event: KeyboardEvent): boolean => {
      const target = event.target;
      const vertex =
        target instanceof HTMLElement
          ? target.closest<HTMLElement>('[data-gl-vertex]')
          : null;
      if (!vertex || !selected) return false;
      updateStep(removeVertex(selected, Number(vertex.dataset.glVertex)));
      return true;
    },
    [selected, updateStep]
  );

  const { fit, actualSize, setSpaceHeld, rootEl } = viewport;
  const rows = useMemo<StudioShortcut[]>(() => {
    const nudgeRow = (
      key: string,
      dx: number,
      dy: number,
      shift: boolean
    ): StudioShortcut => ({
      id: `nudge-${key}${shift ? '-shift' : ''}`,
      key,
      shift,
      when: (e) => selected !== null && onCanvas(e),
      run: () => {
        const step = shift ? NUDGE_SHIFT_PCT : NUDGE_PCT;
        nudge(dx * step, dy * step);
      },
    });
    return [
      {
        id: 'add-mode',
        key: 'a',
        run: () => chooseTool(addingStep ? null : shape),
      },
      { id: 'tool-rect', key: 'r', run: () => chooseTool('rect') },
      { id: 'tool-ellipse', key: 'e', run: () => chooseTool('ellipse') },
      { id: 'tool-polygon', key: 'p', run: () => chooseTool('polygon') },
      {
        id: 'close-polygon',
        key: 'Enter',
        when: () => (polygonDraft?.length ?? 0) >= 3,
        run: () => closePolygon(polygonDraft ?? []),
      },
      {
        id: 'cancel-tool',
        key: 'Escape',
        when: () => addingStep || editingStepId !== null,
        run: () => {
          if (editingStepId) setEditing(null);
          else chooseTool(null);
        },
      },
      nudgeRow('ArrowLeft', -1, 0, false),
      nudgeRow('ArrowRight', 1, 0, false),
      nudgeRow('ArrowUp', 0, -1, false),
      nudgeRow('ArrowDown', 0, 1, false),
      nudgeRow('ArrowLeft', -1, 0, true),
      nudgeRow('ArrowRight', 1, 0, true),
      nudgeRow('ArrowUp', 0, -1, true),
      nudgeRow('ArrowDown', 0, 1, true),
      {
        id: 'next-hotspot',
        key: 'Tab',
        when: (e) => slideSteps.length > 0 && onCanvas(e),
        run: () => cycle(1),
      },
      {
        id: 'prev-hotspot',
        key: 'Tab',
        shift: true,
        when: (e) => slideSteps.length > 0 && onCanvas(e),
        run: () => cycle(-1),
      },
      {
        id: 'pan-hold',
        key: ' ',
        when: onCanvas,
        run: () => setSpaceHeld(true),
      },
      { id: 'zoom-fit', key: '0', run: fit },
      {
        id: 'zoom-actual',
        key: '1',
        run: () => {
          const el = rootEl;
          if (!el) return;
          actualSize(
            fitScale(preset, { w: el.clientWidth, h: el.clientHeight })
          );
        },
      },
    ];
  }, [
    selected,
    nudge,
    chooseTool,
    addingStep,
    shape,
    polygonDraft,
    closePolygon,
    editingStepId,
    slideSteps.length,
    cycle,
    setSpaceHeld,
    fit,
    actualSize,
    rootEl,
    preset,
  ]);

  return {
    rows,
    deleteFocusedVertex,
    viewport,
    shape,
    chooseTool,
    polygonDraft,
    setPolygonDraft: setDraft,
    closePolygon,
    setCalloutFocused,
    editingStepId,
    setEditingStepId: setEditing,
    onGeometry,
  };
}

export type CanvasTools = ReturnType<typeof useCanvasTools>;
