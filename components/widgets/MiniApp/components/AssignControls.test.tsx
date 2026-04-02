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
  buildings: ['school-1'],
  gradeLevels: [],
};

describe('Mini App assign controls', () => {
  it('shows assign copy for personal library items before a session starts', () => {
    render(
      <SortableItem
        app={miniApp}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleLive={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /go live/i })).toHaveAttribute(
      'title',
      'Go Live for Students'
    );
  });

  it('shows assigned state and assignment link affordances for global items', () => {
    render(
      <GlobalAppRow
        app={globalMiniApp}
        onRun={vi.fn()}
        onSaveToLibrary={vi.fn()}
        isSaving={false}
        isLive
        onToggleLive={vi.fn()}
        onCopyLink={vi.fn()}
        sessionCode="ABCD"
      />
    );

    expect(screen.getByRole('button', { name: /live/i })).toHaveAttribute(
      'title',
      'End Live Session'
    );
    expect(screen.getByTitle('Live Session Code')).toBeInTheDocument();
    expect(screen.getByTitle('Copy Student Link')).toBeInTheDocument();
  });
});
