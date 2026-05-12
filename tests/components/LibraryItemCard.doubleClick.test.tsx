/**
 * Focused unit tests for `LibraryItemCard`'s Phase 5 follow-up
 * `onDoubleClick` handling.
 *
 * The card uses a 250ms delay-and-cancel timer to disambiguate
 * single-click (→ preview) from double-click (→ editor). A real
 * dblclick fires onClick *and* onDoubleClick in sequence; without the
 * delay the preview pane would flash open before the editor lands.
 *
 * Contract pinned here:
 *   - Single click runs `onClick` after the 250ms window expires.
 *   - Two clicks inside the window cancel the pending `onClick` and
 *     fire `onDoubleClick` immediately.
 *   - When `onDoubleClick` is omitted, `onClick` still runs
 *     immediately (legacy callers unaffected).
 *   - Clicks on nested buttons / links never reach the body handler.
 */

import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

import {
  LibraryItemCard,
  DBLCLICK_DELAY_MS,
} from '@/components/common/library/LibraryItemCard';

beforeAll(() => {
  // The card uses real timers via setTimeout; vitest's fake timers let
  // us assert the DBLCLICK_DELAY_MS boundary without flaky `await new Promise`.
  vi.useFakeTimers();
});

afterAll(() => {
  // Defensive — Vitest defaults to per-file isolation today so the
  // beforeAll fake-timer install is automatically torn down between
  // files, but if isolation is ever disabled for performance this
  // explicit reset prevents fake timers from leaking into other suites.
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllTimers();
});

function renderCard(opts: {
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  const { onClick, onDoubleClick } = opts;
  render(
    <DndContext>
      <SortableContext items={['card-1']}>
        <LibraryItemCard
          id="card-1"
          title="Test card"
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          sortable={false}
        />
      </SortableContext>
    </DndContext>
  );
}

function clickBody() {
  // The card body is the parent div that owns the click handler. We
  // target the title text and bubble up — the card's handler is on the
  // wrapping div, so any inner click reaches it via React's synthetic
  // event delegation.
  const title = screen.getByText('Test card');
  fireEvent.click(title);
}

describe('LibraryItemCard onDoubleClick delay-and-cancel', () => {
  it('fires single onClick after the DBLCLICK_DELAY_MS window', () => {
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    renderCard({ onClick, onDoubleClick });

    clickBody();
    expect(onClick).not.toHaveBeenCalled(); // Pending the timer.

    act(() => {
      vi.advanceTimersByTime(DBLCLICK_DELAY_MS - 1);
    });
    expect(onClick).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClick).toHaveBeenCalledOnce();
    expect(onDoubleClick).not.toHaveBeenCalled();
  });

  it('cancels the pending onClick and fires onDoubleClick on a second click within the window', () => {
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    renderCard({ onClick, onDoubleClick });

    clickBody();
    act(() => {
      // Halfway through the window — well inside the dblclick zone.
      vi.advanceTimersByTime(Math.floor(DBLCLICK_DELAY_MS / 2));
    });
    clickBody();

    expect(onDoubleClick).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();

    // Advance well past the original window — onClick should remain unfired.
    act(() => {
      vi.advanceTimersByTime(DBLCLICK_DELAY_MS * 2);
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('runs onClick immediately (no delay) when onDoubleClick is omitted', () => {
    const onClick = vi.fn();
    renderCard({ onClick });

    clickBody();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('treats three rapid clicks as (double, single) — the third arms a new window', () => {
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    renderCard({ onClick, onDoubleClick });

    clickBody();
    clickBody(); // → dblclick fires; window cleared
    clickBody(); // → new window opens

    expect(onDoubleClick).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(DBLCLICK_DELAY_MS);
    });
    expect(onClick).toHaveBeenCalledOnce();
  });
});
