import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Dashboard } from '@/types';

const mocks = vi.hoisted(() => ({
  markClaudeBoardSeen: vi.fn(() => Promise.resolve()),
  setDoc: vi.fn(() => Promise.resolve()),
  addToast: vi.fn(),
  loadDashboard: vi.fn(),
  flagOn: true,
  dash: {
    dashboards: [] as Dashboard[],
    activeDashboard: null as Dashboard | null,
    loading: false,
  },
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  setDoc: mocks.setDoc,
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/viewAsTab', () => ({
  viewAsSuppressesBackgroundWrites: () => false,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    canAccessFeature: (id: string) => id === 'ai-boards' && mocks.flagOn,
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    ...mocks.dash,
    addToast: mocks.addToast,
    loadDashboard: mocks.loadDashboard,
    markClaudeBoardSeen: mocks.markClaudeBoardSeen,
  }),
}));

import { useClaudeBoardActivity } from './useClaudeBoardActivity';

const board = (id: string, extra: Partial<Dashboard> = {}): Dashboard => ({
  id,
  name: `Board ${id}`,
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1,
  ...extra,
});

const setBoards = (boards: Dashboard[], activeId: string) => {
  mocks.dash.dashboards = boards;
  mocks.dash.activeDashboard = boards.find((b) => b.id === activeId) ?? null;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.flagOn = true;
  mocks.dash.loading = false;
  setBoards([], '');
});
afterEach(() => vi.useRealTimers());

describe('useClaudeBoardActivity', () => {
  it('toasts with Show when Claude edits another board, never switching by itself', () => {
    setBoards([board('a'), board('b')], 'a');
    const { rerender } = renderHook(() => useClaudeBoardActivity());
    expect(mocks.addToast).not.toHaveBeenCalled();

    setBoards([board('a'), board('b', { claudeEditedAt: Date.now() })], 'a');
    rerender();

    expect(mocks.addToast).toHaveBeenCalledTimes(1);
    const [message, type, action] = mocks.addToast.mock.calls[0] as [
      string,
      string,
      { label: string; onClick: () => void; tourId: string },
    ];
    expect(message).toBe('Claude is editing Board b');
    expect(type).toBe('info');
    expect(action.label).toBe('Show');
    expect(action.tourId).toBe('board.claude-editing-show');
    expect(mocks.loadDashboard).not.toHaveBeenCalled();
    action.onClick();
    expect(mocks.loadDashboard).toHaveBeenCalledWith('b');
  });

  it('says nothing for boards Claude edited before the tab loaded', () => {
    setBoards([board('a'), board('b', { claudeEditedAt: Date.now() })], 'a');
    renderHook(() => useClaudeBoardActivity());
    expect(mocks.addToast).not.toHaveBeenCalled();
  });

  it('says nothing for the board on screen', () => {
    setBoards([board('a')], 'a');
    const { rerender } = renderHook(() => useClaudeBoardActivity());
    setBoards([board('a', { claudeEditedAt: Date.now() })], 'a');
    rerender();
    expect(mocks.addToast).not.toHaveBeenCalled();
  });

  it('shows one toast for a run of edits to the same board', () => {
    setBoards([board('a'), board('b')], 'a');
    const { rerender } = renderHook(() => useClaudeBoardActivity());
    const t0 = Date.now();
    setBoards([board('a'), board('b', { claudeEditedAt: t0 })], 'a');
    rerender();
    setBoards([board('a'), board('b', { claudeEditedAt: t0 + 1 })], 'a');
    rerender();
    expect(mocks.addToast).toHaveBeenCalledTimes(1);
  });

  it('does nothing with the flag off', () => {
    mocks.flagOn = false;
    setBoards([board('a'), board('b', { claudeUnseen: true })], 'b');
    const { rerender } = renderHook(() => useClaudeBoardActivity());
    setBoards([board('a', { claudeEditedAt: Date.now() }), board('b')], 'b');
    rerender();
    expect(mocks.addToast).not.toHaveBeenCalled();
    expect(mocks.markClaudeBoardSeen).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('clears the badge once when the board is opened', () => {
    setBoards(
      [
        board('a', {
          claudeUnseen: true,
          claudeEditedAt: 5,
          claudeAction: 'created',
        }),
      ],
      'a'
    );
    const { rerender } = renderHook(() => useClaudeBoardActivity());
    rerender();
    expect(mocks.markClaudeBoardSeen).toHaveBeenCalledTimes(1);
    expect(mocks.markClaudeBoardSeen).toHaveBeenCalledWith('a');
  });

  it('records the full-screen shape once per shape', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => document.documentElement,
    });
    window.innerWidth = 1600;
    window.innerHeight = 1000;
    renderHook(() => useClaudeBoardActivity());
    vi.advanceTimersByTime(1100);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1100);

    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    expect(mocks.setDoc).toHaveBeenCalledWith(
      'users/u1/userProfile/profile',
      { boardScreen: { w: 1600, h: 1000, at: expect.any(Number) as number } },
      { merge: true }
    );
    Reflect.deleteProperty(document, 'fullscreenElement');
  });

  it('ignores a widget video going full screen', () => {
    vi.useFakeTimers();
    const video = document.createElement('div');
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => video,
    });
    renderHook(() => useClaudeBoardActivity());
    vi.advanceTimersByTime(1100);
    expect(mocks.setDoc).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, 'fullscreenElement');
  });

  it('keeps the badge while the tab is in the background', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    setBoards(
      [
        board('a', {
          claudeUnseen: true,
          claudeEditedAt: 5,
          claudeAction: 'created',
        }),
      ],
      'a'
    );
    renderHook(() => useClaudeBoardActivity());
    expect(mocks.markClaudeBoardSeen).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('records nothing outside full screen', () => {
    vi.useFakeTimers();
    renderHook(() => useClaudeBoardActivity());
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1100);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
