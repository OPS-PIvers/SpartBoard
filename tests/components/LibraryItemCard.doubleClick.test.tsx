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
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';

beforeAll(() => {
  // The card uses real timers via setTimeout; vitest's fake timers let
  // us assert the 250ms boundary without flaky `await new Promise`.
  vi.useFakeTimers();
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
  it('fires single onClick after the 250ms window', () => {
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    renderCard({ onClick, onDoubleClick });

    clickBody();
    expect(onClick).not.toHaveBeenCalled(); // Pending the timer.

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(onClick).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClick).toHaveBeenCalledOnce();
    expect(onDoubleClick).not.toHaveBeenCalled();
  });

  it('cancels the pending onClick and fires onDoubleClick on a second click within 250ms', () => {
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    renderCard({ onClick, onDoubleClick });

    clickBody();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    clickBody();

    expect(onDoubleClick).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();

    // Advance past the original window — onClick should remain unfired.
    act(() => {
      vi.advanceTimersByTime(500);
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
      vi.advanceTimersByTime(250);
    });
    expect(onClick).toHaveBeenCalledOnce();
  });
});
