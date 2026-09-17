import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionSwitcherMenu } from '@/components/layout/CollectionSwitcherMenu';
import type { Collection } from '@/types';

const coll = (
  id: string,
  parent: string | null,
  order = 0,
  name = id
): Collection => ({
  id,
  name,
  parentCollectionId: parent,
  order,
  createdAt: 0,
});

describe('CollectionSwitcherMenu', () => {
  it('always shows the "All Boards (root)" item', () => {
    render(
      <CollectionSwitcherMenu
        collections={[]}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole('menuitem', { name: /no collection/i })
    ).toBeInTheDocument();
  });

  it('renders nested Collections in tree order with depth indent', () => {
    const collections = [
      coll('a', null, 0, 'A'),
      coll('b', 'a', 0, 'B'),
      coll('c', 'a', 1, 'C'),
      coll('d', null, 1, 'D'),
    ];
    render(
      <CollectionSwitcherMenu
        collections={collections}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const menuItems = screen.getAllByRole('menuitem');
    // "No Collection" + 4 Collections = 5 items, in DFS order: root, A, B, C, D.
    const labels = menuItems.map((el) => el.textContent?.trim());
    expect(labels).toEqual([
      expect.stringContaining('No Collection'),
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  it('marks the active Collection', () => {
    render(
      <CollectionSwitcherMenu
        collections={[coll('a', null, 0, 'A')]}
        activeCollectionId="a"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const aItem = screen.getByRole('menuitem', { name: 'A' });
    expect(aItem.className).toMatch(/bg-brand-blue-primary/);
  });

  it('calls onSelect + onClose when an item is clicked', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CollectionSwitcherMenu
        collections={[coll('a', null, 0, 'A')]}
        activeCollectionId={null}
        onSelect={onSelect}
        onClose={onClose}
      />
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'A' }));
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(onClose).toHaveBeenCalled();
  });

  it('passes null to onSelect for the root item', async () => {
    const onSelect = vi.fn();
    render(
      <CollectionSwitcherMenu
        collections={[]}
        activeCollectionId="a"
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: /no collection/i })
    );
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  // Regression test: this menu lives outside any `.widget` DraggableWindow.
  // Pressing Escape while a menu item has focus previously bubbled the
  // keydown past the menu, all the way to DashboardView's global
  // window-level Escape handler — which finds no typing field and no
  // `.widget` ancestor for the focused item, so it falls back to minimizing
  // the topmost widget on the board. Simulates that window-level listener
  // directly rather than mounting the full DashboardView, mirroring the
  // pattern in ToolDockItem.test.tsx (#2266).
  it('does not leak the Escape keydown to window-level listeners', () => {
    render(
      <CollectionSwitcherMenu
        collections={[coll('a', null, 0, 'A')]}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const item = screen.getByRole('menuitem', { name: 'A' });
    item.focus();
    expect(document.activeElement).toBe(item);

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);
    try {
      fireEvent.keyDown(item, { key: 'Escape', bubbles: true });
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
  it('reorders a Collection among its siblings with Alt+Arrow keys', () => {
    const onReorder = vi.fn();
    render(
      <CollectionSwitcherMenu
        collections={[
          coll('a', null, 0, 'A'),
          coll('b', 'a', 0, 'B'),
          coll('c', 'a', 1, 'C'),
          coll('d', null, 1, 'D'),
        ]}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onReorder={onReorder}
      />
    );
    // The menu reads the focused row, so focus it before pressing keys.
    const pressAlt = (name: string, key: string) => {
      const item = screen.getByRole('menuitem', { name });
      item.focus();
      fireEvent.keyDown(item, { key, altKey: true });
    };
    pressAlt('A', 'ArrowDown');
    expect(onReorder).toHaveBeenLastCalledWith(null, ['d', 'a']);

    pressAlt('C', 'ArrowUp');
    expect(onReorder).toHaveBeenLastCalledWith('a', ['c', 'b']);

    // Already last among its siblings: no write.
    onReorder.mockClear();
    pressAlt('D', 'ArrowDown');
    expect(onReorder).not.toHaveBeenCalled();
  });

  // Regression: flattenCollections() surfacing an orphan in its flat output
  // is not enough — this menu re-groups by parent id for nested rendering,
  // so a surfaced orphan whose real (dangling) parentCollectionId is used
  // for that re-grouping never lands in a rendered bucket and stays
  // invisible, defeating the whole fix (#3088 review).
  it('renders an orphaned Collection (dangling parentCollectionId) at root', () => {
    render(
      <CollectionSwitcherMenu
        collections={[coll('orphan', 'deleted-parent', 0, 'Orphan')]}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole('menuitem', { name: 'Orphan' })
    ).toBeInTheDocument();
  });

  it('only shows drag handles when reordering is enabled', () => {
    const collections = [coll('a', null, 0, 'A'), coll('d', null, 1, 'D')];
    const { rerender } = render(
      <CollectionSwitcherMenu
        collections={collections}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.queryAllByRole('button', { name: /drag to reorder/i })
    ).toHaveLength(0);
    rerender(
      <CollectionSwitcherMenu
        collections={collections}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onReorder={vi.fn()}
      />
    );
    expect(
      screen.getAllByRole('button', { name: /drag to reorder/i })
    ).toHaveLength(2);
  });
});
