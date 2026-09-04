import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoardActionsFab } from '@/components/layout/BoardActionsFab';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

import { useDashboard } from '@/context/useDashboard';

const mockedUseDashboard = vi.mocked(useDashboard);

const noop = () => undefined;

const setupContexts = (zoom: number) => {
  const setZoom = vi.fn();
  mockedUseDashboard.mockReturnValue({
    zoom,
    setZoom,
  } as unknown as ReturnType<typeof useDashboard>);
  return { setZoom };
};

describe('BoardActionsFab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the reset FAB when zoom is 1×', () => {
    setupContexts(1);
    render(<BoardActionsFab onOpenHelp={noop} />);
    expect(screen.queryByLabelText('Reset to 100%')).not.toBeInTheDocument();
  });

  it('shows the reset FAB when zoomed in', () => {
    setupContexts(2);
    render(<BoardActionsFab onOpenHelp={noop} />);
    // Two affordances exist when zoomed: the inline reset FAB and the
    // in-popup reset button. Only the inline one is visible without opening
    // the popup, but `getAllBy` is the safe way to assert presence.
    expect(screen.getAllByLabelText('Reset to 100%').length).toBeGreaterThan(0);
  });

  it('shows the reset FAB when zoomed out', () => {
    setupContexts(0.5);
    render(<BoardActionsFab onOpenHelp={noop} />);
    expect(screen.getAllByLabelText('Reset to 100%').length).toBeGreaterThan(0);
  });

  it('clicking reset snaps zoom back to 1×', () => {
    const { setZoom } = setupContexts(2.5);
    render(<BoardActionsFab onOpenHelp={noop} />);
    const resetButtons = screen.getAllByLabelText('Reset to 100%');
    fireEvent.click(resetButtons[0]);
    expect(setZoom).toHaveBeenCalledWith(1);
  });

  it('clicking the help FAB invokes the cheat-sheet callback', () => {
    setupContexts(1);
    const onOpenHelp = vi.fn();
    render(<BoardActionsFab onOpenHelp={onOpenHelp} />);
    fireEvent.click(screen.getByLabelText('helpCenter.title'));
    expect(onOpenHelp).toHaveBeenCalledOnce();
  });

  it('toggles the slider popup when the zoom FAB is clicked', () => {
    setupContexts(1);
    render(<BoardActionsFab onOpenHelp={noop} />);
    const trigger = screen.getByLabelText('Zoom level');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clicking a preset chip applies the matching zoom', () => {
    const { setZoom } = setupContexts(1);
    render(<BoardActionsFab onOpenHelp={noop} />);
    fireEvent.click(screen.getByLabelText('Zoom level'));
    fireEvent.click(screen.getByRole('button', { name: '200%' }));
    expect(setZoom).toHaveBeenCalledWith(2);
  });

  it('always anchors to bottom-right regardless of dock position', () => {
    setupContexts(1);
    const { container } = render(<BoardActionsFab onOpenHelp={noop} />);
    const root = container.querySelector('[data-screenshot="exclude"]');
    expect(root?.className).toContain('right-4');
    expect(root?.className).not.toContain('left-14');
  });

  // Regression test: the zoom popup lives outside any `.widget`
  // DraggableWindow. Pressing Escape while a preset chip (not the range
  // input) has focus previously bubbled the keydown past the popup, all the
  // way to DashboardView's global window-level Escape handler — which finds
  // no typing field and no `.widget` ancestor for the focused chip, so it
  // falls back to minimizing the topmost widget on the board. Simulates that
  // window-level listener directly rather than mounting the full
  // DashboardView, mirroring the pattern in ToolDockItem.test.tsx (#2266).
  it('does not leak the Escape keydown to window-level listeners when a preset chip has focus', () => {
    setupContexts(2);
    render(<BoardActionsFab onOpenHelp={noop} />);
    fireEvent.click(screen.getByLabelText('Zoom level'));
    const presetButton = screen.getByRole('button', { name: '200%' });
    presetButton.focus();
    expect(document.activeElement).toBe(presetButton);

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);
    try {
      fireEvent.keyDown(presetButton, { key: 'Escape', bubbles: true });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });

  // The dead pointer target had no visible affordance, so a click over the
  // FAB just drew an ink dot and read as a broken control.
  it('marks the FAB inert and fades it while a drawing tool is armed', () => {
    mockedUseDashboard.mockReturnValue({
      zoom: 1,
      setZoom: vi.fn(),
      annotationActive: true,
      annotationState: { activeTool: 'pen' },
    } as unknown as ReturnType<typeof useDashboard>);
    render(<BoardActionsFab onOpenHelp={noop} />);
    const root = screen
      .getByLabelText('Zoom level')
      .closest('[data-screenshot="exclude"]') as HTMLElement;
    expect(root).toHaveAttribute('aria-disabled', 'true');
    expect(root.className).toContain('opacity-40');
    expect(root.className).toContain('pointer-events-none');
  });

  it('drops the inert state once Select is armed', () => {
    mockedUseDashboard.mockReturnValue({
      zoom: 1,
      setZoom: vi.fn(),
      annotationActive: true,
      annotationState: { activeTool: 'select' },
    } as unknown as ReturnType<typeof useDashboard>);
    render(<BoardActionsFab onOpenHelp={noop} />);
    const root = screen
      .getByLabelText('Zoom level')
      .closest('[data-screenshot="exclude"]') as HTMLElement;
    expect(root).not.toHaveAttribute('aria-disabled');
    expect(root.className).not.toContain('opacity-40');
  });
});
