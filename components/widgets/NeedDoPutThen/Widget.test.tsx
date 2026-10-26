import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NeedDoPutThenWidget } from './Widget';
import {
  useGlobalStyle,
  useDashboardActions,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import { WidgetData, DEFAULT_GLOBAL_STYLE } from '@/types';
import { DEFAULT_THEN_ITEMS } from './constants';

// Mock the mount-stable dashboard store surfaces the widget consumes.
vi.mock('@/context/dashboardCanvasStore');

describe('NeedDoPutThenWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGlobalStyle).mockReturnValue(DEFAULT_GLOBAL_STYLE);
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: vi.fn(),
    } as unknown as DashboardActions);
  });

  const createWidgetData = (config: Record<string, unknown>): WidgetData => ({
    id: 'test-need-do-put-then-1',
    type: 'need-do-put-then',
    x: 0,
    y: 0,
    z: 1,
    w: 6,
    h: 6,
    flipped: false,
    config,
  });

  // The Need/Put/Then drawers render via createPortal, anchored to the
  // nearest `[data-widget-id]` ancestor. Production provides this via
  // DraggableWindow; tests must provide it explicitly.
  const renderWidget = (widget: WidgetData) =>
    render(
      <div data-widget-id={widget.id}>
        <NeedDoPutThenWidget widget={widget} />
      </div>
    );

  it('shows the ScaledEmptyState fallback in an open Need/Put drawer with zero items', () => {
    // thenItems keeps the widget out of its top-level "nothing configured"
    // state so the Need/Put drawers (and their TileGrid) actually render.
    const widget = createWidgetData({
      needItems: [],
      putItems: [],
      thenItems: DEFAULT_THEN_ITEMS,
    });

    renderWidget(widget);

    const emptyLabels = screen.getAllByText('Flip to add items');
    // One TileGrid empty state per empty drawer (Need and Put).
    expect(emptyLabels).toHaveLength(2);
  });

  it('renders tiles instead of the empty state once items exist', () => {
    const widget = createWidgetData({
      needItems: [
        { id: 'pencil', label: 'Pencil', icon: 'Pencil', color: '#facc15' },
      ],
      putItems: [],
      thenItems: DEFAULT_THEN_ITEMS,
    });

    renderWidget(widget);

    expect(screen.getByText('Pencil')).toBeInTheDocument();
    // Only the Put drawer is still empty now.
    expect(screen.getAllByText('Flip to add items')).toHaveLength(1);
  });

  describe('Do list touch dragging', () => {
    // DraggableWindow skips touch drags that start inside these.
    const TOUCH_DRAG_BLOCKING =
      '.overflow-y-auto, .overflow-auto, [data-scrollable="true"]';
    const stubHeights = (scrollHeight: number, clientHeight: number) => {
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
        scrollHeight
      );
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(
        clientHeight
      );
    };
    const widget = createWidgetData({
      doItems: ['Sharpen pencil', 'Open notebook'],
      thenItems: DEFAULT_THEN_ITEMS,
    });

    afterEach(() => vi.restoreAllMocks());

    it('is not a scroller when the steps fit, so a finger on it drags the widget', () => {
      stubHeights(200, 200);
      renderWidget(widget);
      const list = screen.getByTestId('need-do-put-then-do-list');
      expect(
        screen.getByText('Sharpen pencil').closest(TOUCH_DRAG_BLOCKING)
      ).toBeNull();
      expect(list).toHaveClass('overflow-hidden');
    });

    it('scrolls when the steps overflow', () => {
      stubHeights(400, 200);
      renderWidget(widget);
      expect(screen.getByTestId('need-do-put-then-do-list')).toHaveClass(
        'overflow-y-auto'
      );
    });
  });
});
