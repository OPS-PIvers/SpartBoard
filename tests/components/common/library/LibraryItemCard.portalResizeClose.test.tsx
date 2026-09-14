/**
 * Regression test: the 2026-09-13 fix made LibraryItemCard's overflow menu
 * close on the host widget's own geometry changes (Alt+M/Alt+R, live
 * resize-drag) by walking up from the menu's own DOM node with
 * `.closest('[data-draggable-window]')`. That walk only works when the card
 * is a real DOM descendant of the widget. LibraryItemCard is also rendered
 * inside library-browser Modals opened from a widget's front face (e.g.
 * ActivityWall's WallLibraryModal) — Modal portals its content straight to
 * document.body, so in the real DOM the card's ancestor chain never reaches
 * `[data-draggable-window]` even though it does in the React tree. `.closest()`
 * then finds nothing, the ResizeObserver guard silently no-ops, and the menu
 * is stranded at stale coordinates on any host resize — the exact bug the
 * 2026-09-13 fix was meant to close, just one portal deeper.
 *
 * FIX: thread the host element through WidgetHostContext (crosses portal
 * boundaries, since React context follows the component tree, not the DOM
 * tree) instead of relying solely on `.closest()`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createPortal } from 'react-dom';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from '@testing-library/react';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';
import { WidgetHostContext } from '@/components/common/WidgetHostContext';

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

// Simulates a library Modal (createPortal to a node outside the widget) opened
// from within a widget's front face, with WidgetHostContext threaded through
// as DraggableWindow does — the way this actually gets rendered on the board.
const ModalLikePortal: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const portalRoot = document.createElement('div');
  document.body.appendChild(portalRoot);
  return createPortal(children, portalRoot);
};

describe('LibraryItemCard overflow menu — closes on host resize across a Modal portal', () => {
  it('observes the real widget host (via context) even when rendered inside a Modal portal', () => {
    ResizeObserverSpy.instances.length = 0;
    vi.stubGlobal('ResizeObserver', ResizeObserverSpy);

    const hostRef = { current: document.createElement('div') };
    hostRef.current.setAttribute('data-draggable-window', '');
    document.body.appendChild(hostRef.current);

    render(
      <WidgetHostContext.Provider value={hostRef}>
        <ModalLikePortal>
          <LibraryItemCard
            id="card-1"
            title="Test card"
            sortable={false}
            secondaryActions={[
              { id: 'delete', label: 'Delete', onClick: vi.fn() },
            ]}
          />
        </ModalLikePortal>
      </WidgetHostContext.Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Bug on baseline: the card's DOM ancestor chain (Modal portal -> body)
    // never reaches hostRef.current, so `.closest()` finds nothing and no
    // observer is ever created — this assertion fails before the fix.
    expect(ResizeObserverSpy.instances).toHaveLength(1);
    const instance = ResizeObserverSpy.instances[0];
    expect(instance.observe).toHaveBeenCalledWith(hostRef.current);

    act(() => {
      instance.callback([], instance as unknown as ResizeObserver); // observe()'s always-fires-once initial callback
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();

    act(() => {
      instance.callback([], instance as unknown as ResizeObserver); // a real geometry change
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
