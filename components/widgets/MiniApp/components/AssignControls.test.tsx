import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortableItem } from './SortableItem';
import { GlobalAppRow } from './GlobalAppRow';
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
  buildings: [],
};

describe('Mini App assign controls', () => {
  it('shows assign button for personal library items', () => {
    render(
      <SortableItem
        app={miniApp}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAssign={vi.fn()}
        onShowAssignments={vi.fn()}
      />
    );

    expect(screen.getByTitle('Assign (copy student link)')).toBeInTheDocument();
  });

  it('shows assign button for global library items', () => {
    render(
      <GlobalAppRow
        app={globalMiniApp}
        onRun={vi.fn()}
        onSaveToLibrary={vi.fn()}
        isSaving={false}
        onAssign={vi.fn()}
        onShowAssignments={vi.fn()}
      />
    );

    expect(screen.getByTitle('Assign (copy student link)')).toBeInTheDocument();
  });
});
