import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MiniAppManager } from './MiniAppManager';
import { GlobalMiniAppItem, MiniAppItem } from '@/types';

const miniApp: MiniAppItem = {
  id: 'mini-app-1',
  title: 'Class Poll',
  html: '<html><body>Mini app</body></html>',
  createdAt: 1712000000000,
  order: 0,
};

const globalMiniApp: GlobalMiniAppItem = {
  ...miniApp,
  id: 'global-app-1',
  buildings: [],
};

const baseProps = {
  tab: 'library' as const,
  onTabChange: vi.fn(),
  assignments: [],
  onCreate: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onRun: vi.fn(),
  onAssign: vi.fn(),
  onShowAssignments: vi.fn(),
  onReorder: vi.fn(),
  onSaveGlobalToLibrary: vi.fn(),
  savingGlobalId: null,
  onImport: vi.fn(),
  onExport: vi.fn(),
  onArchiveCopyUrl: vi.fn(),
  onArchiveEnd: vi.fn(),
  onArchiveDelete: vi.fn(),
};

describe('MiniAppManager assign controls', () => {
  it('shows an Assign primary action for personal library items', () => {
    render(
      <MiniAppManager
        {...baseProps}
        personalLibrary={[miniApp]}
        globalLibrary={[]}
      />
    );

    // LibraryItemCard renders the primary action as a button with the label.
    expect(
      screen.getAllByRole('button', { name: /assign/i }).length
    ).toBeGreaterThan(0);
  });

  it('exposes Assign on global library items but hides Edit/Delete (read-only view)', async () => {
    const user = userEvent.setup();

    render(
      <MiniAppManager
        {...baseProps}
        personalLibrary={[miniApp]}
        globalLibrary={[globalMiniApp]}
      />
    );

    // Switch the toolbar Source filter to Global so only the global card is
    // visible — this is the view we actually want to exercise.
    const sourceSelect = screen.getByRole('combobox', { name: 'Source' });
    await user.selectOptions(sourceSelect, 'global');

    // Global-only view: the personal mini-app should no longer be in the DOM.
    expect(screen.queryByText('Class Poll')).toBeInTheDocument(); // global + personal share the same title
    const cards = screen.getAllByText('Class Poll');
    // Exactly one card renders (the global one) now that personal is filtered.
    expect(cards).toHaveLength(1);

    // Assign is still the primary action on the global card.
    const assignButtons = screen.getAllByRole('button', { name: /assign/i });
    expect(assignButtons.length).toBeGreaterThan(0);

    // Edit / Delete must NOT appear anywhere for global cards — including
    // inside the overflow menu once it's opened.
    const moreButton = screen.getByRole('button', { name: 'More actions' });
    await user.click(moreButton);

    const menu = screen.getByRole('menu');
    expect(
      within(menu).queryByRole('menuitem', { name: /edit/i })
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: /delete/i })
    ).not.toBeInTheDocument();
    // Save-to-library is the global-specific affordance.
    expect(
      within(menu).getByRole('menuitem', { name: /save to my library/i })
    ).toBeInTheDocument();
  });
});
