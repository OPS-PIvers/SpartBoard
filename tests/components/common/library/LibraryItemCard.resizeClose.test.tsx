/**
 * Regression test: LibraryItemCard's overflow menu (kebab -> OverflowMenu) is
 * `position: fixed` and portalled to document.body, with its coordinates
 * captured once at open time from the trigger button's rect. It only closed
 * on a window 'scroll'/'resize' event or a pointerdown outside the trigger —
 * neither fires when the HOST WIDGET itself is resized via a keyboard
 * shortcut (Alt+M maximize/restore, Alt+R reset size), since those mutate
 * widget state directly with no window-level event and no pointerdown. The
 * menu was left open, floating at its stale pre-resize coordinates.
 *
 * FIX: observe the nearest `[data-draggable-window]` ancestor with a
 * ResizeObserver and close the menu on any geometry change, mirroring the
 * same fix applied to the sibling `AssignmentArchiveCard`/`sessionViews`
 * OverflowMenu implementations.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from '@testing-library/react';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';

afterEach(cleanup);

class ResizeObserverSpy {
  static instances: ResizeObserverSpy[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: ResizeObserverCallback) {
    ResizeObserverSpy.instances.push(this);
  }
}

describe('LibraryItemCard overflow menu — closes on host widget resize', () => {
  it('closes when the [data-draggable-window] ancestor resizes (e.g. Alt+M maximize/restore)', () => {
    ResizeObserverSpy.instances.length = 0;
    vi.stubGlobal('ResizeObserver', ResizeObserverSpy);

    render(
      <div data-draggable-window="">
        <LibraryItemCard
          id="card-1"
          title="Test card"
          sortable={false}
          secondaryActions={[
            { id: 'delete', label: 'Delete', onClick: vi.fn() },
          ]}
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    expect(ResizeObserverSpy.instances).toHaveLength(1);
    const instance = ResizeObserverSpy.instances[0];
    // A real ResizeObserver always fires once immediately on observe(), before any actual resize.
    act(() => {
      instance.callback([], instance as unknown as ResizeObserver);
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();

    act(() => {
      instance.callback([], instance as unknown as ResizeObserver);
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
