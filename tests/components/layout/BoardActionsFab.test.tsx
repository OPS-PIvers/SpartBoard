import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoardActionsFab } from '@/components/layout/BoardActionsFab';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';

const mockedUseDashboard = vi.mocked(useDashboard);
const mockedUseAuth = vi.mocked(useAuth);

const noop = () => undefined;

const setupContexts = (zoom: number) => {
  const setZoom = vi.fn();
  mockedUseDashboard.mockReturnValue({
    zoom,
    setZoom,
  } as unknown as ReturnType<typeof useDashboard>);
  mockedUseAuth.mockReturnValue({
    dockPosition: 'left',
  } as unknown as ReturnType<typeof useAuth>);
  return { setZoom };
};

describe('BoardActionsFab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the reset FAB when zoom is 1×', () => {
    setupContexts(1);
    render(<BoardActionsFab onOpenCheatSheet={noop} />);
    expect(screen.queryByLabelText('Reset to 100%')).not.toBeInTheDocument();
  });

  it('shows the reset FAB when zoomed in', () => {
    setupContexts(2);
    render(<BoardActionsFab onOpenCheatSheet={noop} />);
    // Two affordances exist when zoomed: the inline reset FAB and the
    // in-popup reset button. Only the inline one is visible without opening
    // the popup, but `getAllBy` is the safe way to assert presence.
    expect(screen.getAllByLabelText('Reset to 100%').length).toBeGreaterThan(0);
  });

  it('shows the reset FAB when zoomed out', () => {
    setupContexts(0.5);
    render(<BoardActionsFab onOpenCheatSheet={noop} />);
    expect(screen.getAllByLabelText('Reset to 100%').length).toBeGreaterThan(0);
  });

  it('clicking reset snaps zoom back to 1×', () => {
    const { setZoom } = setupContexts(2.5);
    render(<BoardActionsFab onOpenCheatSheet={noop} />);
    const resetButtons = screen.getAllByLabelText('Reset to 100%');
    fireEvent.click(resetButtons[0]);
    expect(setZoom).toHaveBeenCalledWith(1);
  });

  it('clicking the help FAB invokes the cheat-sheet callback', () => {
    setupContexts(1);
    const onOpenCheatSheet = vi.fn();
    render(<BoardActionsFab onOpenCheatSheet={onOpenCheatSheet} />);
    fireEvent.click(screen.getByLabelText('widgets.cheatSheet.title'));
    expect(onOpenCheatSheet).toHaveBeenCalledOnce();
  });

  it('toggles the slider popup when the zoom FAB is clicked', () => {
    setupContexts(1);
    render(<BoardActionsFab onOpenCheatSheet={noop} />);
    const trigger = screen.getByLabelText('Zoom level');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clicking a preset chip applies the matching zoom', () => {
    const { setZoom } = setupContexts(1);
    render(<BoardActionsFab onOpenCheatSheet={noop} />);
    fireEvent.click(screen.getByLabelText('Zoom level'));
    fireEvent.click(screen.getByRole('button', { name: '200%' }));
    expect(setZoom).toHaveBeenCalledWith(2);
  });

  it('switches anchoring to the left when the dock is on the right', () => {
    mockedUseDashboard.mockReturnValue({
      zoom: 1,
      setZoom: vi.fn(),
    } as unknown as ReturnType<typeof useDashboard>);
    mockedUseAuth.mockReturnValue({
      dockPosition: 'right',
    } as unknown as ReturnType<typeof useAuth>);
    const { container } = render(<BoardActionsFab onOpenCheatSheet={noop} />);
    const root = container.querySelector('[data-screenshot="exclude"]');
    expect(root?.className).toContain('left-14');
    expect(root?.className).not.toContain('right-4');
  });
});
