import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroupBoundingBox } from './GroupBoundingBox';
import { getWidgetOverride } from './widgetRefRegistry';
import type { WidgetData } from '@/types';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';

const updateWidgets = vi.fn();
const ctx = { updateWidgets } as unknown as DashboardContextValue;

const makeWidget = (id: string, x: number): WidgetData => ({
  id,
  type: 'clock',
  x,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
  flipped: false,
  config: {},
});

describe('GroupBoundingBox cancelled resize', () => {
  beforeEach(() => {
    updateWidgets.mockClear();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('reverts instead of committing when the pointer is cancelled', () => {
    const widgets = [makeWidget('w1', 0), makeWidget('w2', 200)];
    render(
      <DashboardContext.Provider value={ctx}>
        <GroupBoundingBox groupWidgets={widgets} zoom={1} />
      </DashboardContext.Provider>
    );
    const handle = document.querySelector<HTMLElement>(
      '[data-testid="group-resize-handle-se"]'
    );
    if (!handle) throw new Error('handle missing');
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn().mockReturnValue(false);
    handle.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(handle, { clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 360, clientY: 170, pointerId: 1 });
    expect(getWidgetOverride('w1')).toBeDefined();

    // Browsers report 0,0 on pointercancel.
    act(() => {
      fireEvent.pointerCancel(window, { clientX: 0, clientY: 0, pointerId: 1 });
    });

    expect(updateWidgets).not.toHaveBeenCalled();
    expect(getWidgetOverride('w1')).toBeUndefined();
    expect(getWidgetOverride('w2')).toBeUndefined();
  });
});
