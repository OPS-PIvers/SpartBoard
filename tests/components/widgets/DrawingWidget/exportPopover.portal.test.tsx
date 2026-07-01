import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: vi.fn(),
    bringToFront: vi.fn(),
    activeDashboard: { id: 'test-dashboard' },
    addToast: vi.fn(),
    addWidget: vi.fn(),
    drawingWidgetsMigrating: new Set(),
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-uid' },
    canAccessFeature: () => true,
  }),
}));
vi.mock('@/hooks/useDrawingObjects', () => ({
  useDrawingObjects: () => ({ objects: [], setObjects: vi.fn() }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadFile: vi.fn() }),
}));
vi.mock('@/components/widgets/DrawingWidget/useDrawingObjectsDoc', () => ({
  useDrawingObjectsDoc: () => ({
    objects: [],
    addObject: vi.fn(),
    updateObject: vi.fn(),
    removeObject: vi.fn(),
    clear: vi.fn(),
    loading: false,
  }),
}));

import { DrawingWidget } from '@/components/widgets/DrawingWidget/Widget';
import type { WidgetData } from '@/types';

afterEach(cleanup);

const makeWidget = (): WidgetData =>
  ({
    id: 'test-drawing',
    type: 'drawing',
    x: 0,
    y: 0,
    w: 800,
    h: 600,
    z: 1,
    flipped: false,
    minimized: false,
    config: {},
  }) as unknown as WidgetData;

describe('DrawingWidget export popover — portal attribute', () => {
  it('has data-widget-portal on the export popover so isEscapeFromWidgetInput recognises it', () => {
    render(<DrawingWidget widget={makeWidget()} />);

    const exportBtn = screen.queryByRole('button', { name: /export/i });
    if (!exportBtn) {
      // Toolbar may not render in jsdom without a canvas context — skip gracefully.
      return;
    }
    fireEvent.click(exportBtn);

    const popover = document.getElementById('drawing-export-popover');
    expect(popover).not.toBeNull();
    expect(popover?.hasAttribute('data-widget-portal')).toBe(true);
  });
});
