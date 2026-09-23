import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Only the routing is under test here, so every screen is a marker.
vi.mock('./SubsAuthGate', () => ({
  SubsAuthGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./BuildingPickerScreen', () => ({
  BuildingPickerScreen: () => <div>building-picker</div>,
}));
vi.mock('./TeacherDirectoryScreen', () => ({
  TeacherDirectoryScreen: ({ buildingId }: { buildingId: string }) => (
    <div>directory:{buildingId}</div>
  ),
}));
vi.mock('./SubBoardScreen', () => ({
  SubBoardScreen: () => <div>board</div>,
}));
vi.mock('./SubCollectionBoardScreen', () => ({
  SubCollectionBoardScreen: () => <div>collection-board</div>,
}));
vi.mock('./SubShareLinkScreen', () => ({
  SubShareLinkScreen: ({
    shareId,
    boardId,
  }: {
    shareId: string;
    boardId?: string;
  }) => (
    <div>
      share-link:{shareId}:{boardId ?? 'default'}
    </div>
  ),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'sub-uid' } }),
}));

import { SubsApp } from './SubsApp';

const KEY = 'spart_subs_view_sub-uid';

const at = (path: string) => window.history.pushState({}, '', path);

describe('SubsApp routing', () => {
  beforeEach(() => {
    window.localStorage.clear();
    at('/subs');
  });

  afterEach(() => {
    window.localStorage.clear();
    at('/');
  });

  it('starts on the building picker with no link and nothing remembered', () => {
    render(<SubsApp />);
    expect(screen.getByText('building-picker')).toBeInTheDocument();
  });

  it('restores the last building when there is no link', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ kind: 'directory', buildingId: 'ohs' })
    );
    render(<SubsApp />);
    expect(screen.getByText('directory:ohs')).toBeInTheDocument();
  });

  it('opens a share link instead of the building picker', () => {
    at('/subs/s/share-7');
    render(<SubsApp />);
    expect(screen.getByText('share-link:share-7:default')).toBeInTheDocument();
  });

  it('carries the board named in the link', () => {
    at('/subs/s/share-7/board-3');
    render(<SubsApp />);
    expect(screen.getByText('share-link:share-7:board-3')).toBeInTheDocument();
  });

  // The teacher sent this sub somewhere specific; wherever they were last is
  // not where they should land.
  it('lets a link win over the remembered building', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ kind: 'directory', buildingId: 'ohs' })
    );
    at('/subs/s/share-7');
    render(<SubsApp />);
    expect(screen.getByText('share-link:share-7:default')).toBeInTheDocument();
    expect(screen.queryByText('directory:ohs')).not.toBeInTheDocument();
  });

  it('ignores a malformed link and starts on the building picker', () => {
    at('/subs/s/');
    render(<SubsApp />);
    expect(screen.getByText('building-picker')).toBeInTheDocument();
  });
});
