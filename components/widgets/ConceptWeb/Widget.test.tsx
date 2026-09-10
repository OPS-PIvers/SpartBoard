import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConceptWebWidget } from './Widget';
import {
  useDashboardActions,
  useGlobalStyle,
  useIsActiveBoardReadOnly,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import { WidgetData, ConceptWebConfig, DEFAULT_GLOBAL_STYLE } from '@/types';

vi.mock('@/context/dashboardCanvasStore');

const CONTAINER_SIZE = 1000;

// jsdom drops movementX/movementY from PointerEventInit, so override them directly.
const dispatchPointerMoveWithMovement = (
  el: HTMLElement,
  pointerId: number,
  movementX: number,
  movementY: number
) => {
  const evt = new PointerEvent('pointermove', { bubbles: true, pointerId });
  Object.defineProperty(evt, 'movementX', {
    value: movementX,
    configurable: true,
  });
  Object.defineProperty(evt, 'movementY', {
    value: movementY,
    configurable: true,
  });
  act(() => {
    el.dispatchEvent(evt);
  });
};

describe('ConceptWebWidget — node bounds clamping', () => {
  const mockUpdateWidget = vi.fn();
  const mockBringToFront = vi.fn();
  let originalGetBoundingClientRect: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: mockUpdateWidget,
      bringToFront: mockBringToFront,
    } as unknown as DashboardActions);
    vi.mocked(useGlobalStyle).mockReturnValue(DEFAULT_GLOBAL_STYLE);
    vi.mocked(useIsActiveBoardReadOnly).mockReturnValue(false);

    originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getBoundingClientRect'
    );
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: CONTAINER_SIZE,
        height: CONTAINER_SIZE,
        top: 0,
        left: 0,
        right: CONTAINER_SIZE,
        bottom: CONTAINER_SIZE,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalGetBoundingClientRect) {
      Object.defineProperty(
        HTMLElement.prototype,
        'getBoundingClientRect',
        originalGetBoundingClientRect
      );
    }
  });

  const createWidgetData = (config: Partial<ConceptWebConfig>): WidgetData => ({
    id: 'concept-web-1',
    type: 'concept-web',
    x: 0,
    y: 0,
    w: 8,
    h: 6,
    z: 1,
    flipped: false,
    config: {
      nodes: [],
      edges: [],
      ...config,
    } as ConceptWebConfig,
  });

  it('clamps a dragged node so it cannot be moved past the container edge', () => {
    const widgetData = createWidgetData({
      nodes: [
        { id: 'node-1', text: 'Idea', x: 40, y: 40, width: 15, height: 15 },
      ],
    });
    const { container } = render(<ConceptWebWidget widget={widgetData} />);

    const nodeEl = container.querySelector<HTMLElement>(
      '[data-node-id="node-1"]'
    );
    if (!nodeEl) throw new Error('Node element not found');
    nodeEl.setPointerCapture = vi.fn();
    nodeEl.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(nodeEl, { pointerId: 1 });
    // Raw target (100, 100) would be past the edge for a 15%-wide/tall node.
    dispatchPointerMoveWithMovement(nodeEl, 1, 600, 600);
    fireEvent.pointerUp(nodeEl, { pointerId: 1 });

    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    const savedConfig = (
      mockUpdateWidget.mock.calls[0][1] as { config: ConceptWebConfig }
    ).config;
    const savedNode = savedConfig.nodes.find((n) => n.id === 'node-1');
    if (!savedNode) throw new Error('node-1 missing from saved config');

    // Unclamped this would be (100, 100) — invisible past the container edge.
    expect(savedNode.x).toBe(85);
    expect(savedNode.y).toBe(85);
  });

  it('clamps a resized node so its right/bottom edge cannot exceed the container', () => {
    const widgetData = createWidgetData({
      nodes: [
        { id: 'node-1', text: 'Idea', x: 40, y: 40, width: 5, height: 5 },
      ],
    });
    const { container } = render(<ConceptWebWidget widget={widgetData} />);

    const resizeHandle = container.querySelector<HTMLElement>('.resize-handle');
    if (!resizeHandle) throw new Error('Resize handle not found');
    resizeHandle.setPointerCapture = vi.fn();
    resizeHandle.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(resizeHandle, { pointerId: 1 });
    // Raw target width/height (65) would push the right/bottom edge to 105%.
    dispatchPointerMoveWithMovement(resizeHandle, 1, 600, 600);
    fireEvent.pointerUp(resizeHandle, { pointerId: 1 });

    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    const savedConfig = (
      mockUpdateWidget.mock.calls[0][1] as { config: ConceptWebConfig }
    ).config;
    const savedNode = savedConfig.nodes.find((n) => n.id === 'node-1');
    if (!savedNode) throw new Error('node-1 missing from saved config');

    // Node anchors at x=40/y=40 — width/height must stop at exactly 60.
    expect(savedNode.width).toBe(60);
    expect(savedNode.height).toBe(60);
  });

  it('heals a node persisted out of bounds so it renders inside the container', () => {
    const widgetData = createWidgetData({
      nodes: [
        // Persisted before this clamp existed — unrecoverable via drag alone
        // since the container is overflow-hidden and the node can't be grabbed.
        { id: 'node-1', text: 'Idea', x: 150, y: -20, width: 15, height: 15 },
      ],
    });
    const { container } = render(<ConceptWebWidget widget={widgetData} />);

    const nodeEl = container.querySelector<HTMLElement>(
      '[data-node-id="node-1"]'
    );
    if (!nodeEl) throw new Error('Node element not found');

    expect(nodeEl.style.left).toBe('85%');
    expect(nodeEl.style.top).toBe('0%');
  });

  it('heals a node persisted wider than the container so it never overflows', () => {
    const widgetData = createWidgetData({
      nodes: [
        { id: 'node-1', text: 'Idea', x: 96, y: 96, width: 120, height: 120 },
      ],
    });
    const { container } = render(<ConceptWebWidget widget={widgetData} />);

    const nodeEl = container.querySelector<HTMLElement>(
      '[data-node-id="node-1"]'
    );
    if (!nodeEl) throw new Error('Node element not found');

    expect(nodeEl.style.width).toBe('100%');
    expect(nodeEl.style.height).toBe('100%');
    expect(nodeEl.style.left).toBe('0%');
    expect(nodeEl.style.top).toBe('0%');
  });

  it('does not collapse a healed out-of-bounds node to the size floor on the first resize touch', () => {
    const widgetData = createWidgetData({
      nodes: [
        // Raw x=150 is out of bounds; the node renders healed at x=85. maxW
        // must be computed from the healed x, not the raw one, or it goes
        // negative and Math.min forces the node straight to the 5% floor.
        { id: 'node-1', text: 'Idea', x: 150, y: -20, width: 15, height: 15 },
      ],
    });
    const { container } = render(<ConceptWebWidget widget={widgetData} />);

    const resizeHandle = container.querySelector<HTMLElement>('.resize-handle');
    if (!resizeHandle) throw new Error('Resize handle not found');
    resizeHandle.setPointerCapture = vi.fn();
    resizeHandle.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(resizeHandle, { pointerId: 1 });
    // A tiny nudge should barely change the size, not collapse it to 5.
    dispatchPointerMoveWithMovement(resizeHandle, 1, 1, 1);
    fireEvent.pointerUp(resizeHandle, { pointerId: 1 });

    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    const savedConfig = (
      mockUpdateWidget.mock.calls[0][1] as { config: ConceptWebConfig }
    ).config;
    const savedNode = savedConfig.nodes.find((n) => n.id === 'node-1');
    if (!savedNode) throw new Error('node-1 missing from saved config');

    expect(savedNode.width).toBeGreaterThan(14);
  });
});
