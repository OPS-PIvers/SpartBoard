import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { WidgetData, HotspotImageConfig } from '@/types';
import { HotspotImageWidget } from './Widget';

vi.mock('@/context/dashboardCanvasStore');

const mockUpdateWidget = vi.fn();

const createWidget = (
  config: Partial<HotspotImageConfig> = {}
): WidgetData => ({
  id: 'hotspot-1',
  type: 'hotspot-image',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: false,
  config: {
    baseImageUrl: 'data:image/png;base64,AAAA',
    hotspots: [
      {
        id: 'h1',
        xPct: 50,
        yPct: 50,
        title: 'Pin One',
        detailText: 'Detail body text',
        icon: 'info',
        isViewed: false,
      },
    ],
    ...config,
  } as HotspotImageConfig,
});

describe('HotspotImageWidget', () => {
  beforeEach(() => {
    mockUpdateWidget.mockReset();
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: mockUpdateWidget,
    } as unknown as ReturnType<typeof useDashboardActions>);
  });

  afterEach(() => {
    cleanup();
  });

  it('closes the open popover when Escape is pressed on the focused pin', () => {
    render(<HotspotImageWidget widget={createWidget()} />);

    const pin = screen.getByRole('button', { name: /Open hotspot: Pin One/ });
    fireEvent.click(pin);
    expect(screen.getByText('Detail body text')).toBeInTheDocument();

    // Escape fires on the still-focused pin button — a real DOM/React
    // bubble, not a synthetic document-level dispatch — so this also
    // exercises the same bubble path an ancestor's onKeyDown would see.
    fireEvent.keyDown(pin, { key: 'Escape' });

    expect(screen.queryByText('Detail body text')).not.toBeInTheDocument();
  });

  it('stops Escape from reaching an ancestor onKeyDown (e.g. DraggableWindow) while open', () => {
    // DraggableWindow attaches its own onKeyDown on a GlassCard ancestor
    // and minimizes the widget on Escape. Simulate that ancestor here to
    // prove the popover's Escape handler shadows it via React's synthetic
    // bubble phase, not just a document-level listener.
    const ancestorHandler = vi.fn();

    render(
      <div onKeyDown={ancestorHandler}>
        <HotspotImageWidget widget={createWidget()} />
      </div>
    );

    const pin = screen.getByRole('button', { name: /Open hotspot: Pin One/ });
    fireEvent.click(pin);
    expect(screen.getByText('Detail body text')).toBeInTheDocument();

    fireEvent.keyDown(pin, { key: 'Escape' });

    expect(screen.queryByText('Detail body text')).not.toBeInTheDocument();
    expect(ancestorHandler).not.toHaveBeenCalled();
  });

  it('closes the popover (not the widget) after a real mouse click, even though DraggableWindow steals focus to its own root on pointerdown', () => {
    // DraggableWindow.handlePointerDown calls
    // `(e.currentTarget as HTMLElement).focus()` on its own GlassCard root
    // for every pointerdown inside the widget (DraggableWindow.tsx:782-805),
    // unless the target is contenteditable. So after a *real* mouse click —
    // pointerdown then click, not just click — DOM focus lands on that
    // ancestor root, not on the pin button. Escape's keydown target is then
    // the ancestor itself; bubbling only flows target -> ancestors, never
    // into a descendant's onKeyDown. Mimic that focus-steal here.
    const ancestorHandler = vi.fn();

    function AncestorLikeGlassCard({ children }: { children: ReactNode }) {
      const handlePointerDown = (e: ReactPointerEvent) => {
        const targetEl = e.target instanceof Element ? e.target : null;
        if (!targetEl?.closest('[contenteditable="true"]')) {
          (e.currentTarget as HTMLElement).focus();
        }
      };
      return (
        <div
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onKeyDown={ancestorHandler}
        >
          {children}
        </div>
      );
    }

    render(
      <AncestorLikeGlassCard>
        <HotspotImageWidget widget={createWidget()} />
      </AncestorLikeGlassCard>
    );

    const pin = screen.getByRole('button', { name: /Open hotspot: Pin One/ });
    fireEvent.pointerDown(pin);
    fireEvent.click(pin);
    expect(screen.getByText('Detail body text')).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });

    expect(screen.queryByText('Detail body text')).not.toBeInTheDocument();
    expect(ancestorHandler).not.toHaveBeenCalled();
  });

  it('is unaffected by Escape originating from a text input in another widget', () => {
    const windowHandler = vi.fn();
    window.addEventListener('keydown', windowHandler);

    render(<HotspotImageWidget widget={createWidget()} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Open hotspot: Pin One/ })
    );
    expect(screen.getByText('Detail body text')).toBeInTheDocument();

    const otherWidget = document.createElement('div');
    otherWidget.setAttribute('data-draggable-window', '');
    const input = document.createElement('input');
    otherWidget.appendChild(input);
    document.body.appendChild(otherWidget);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByText('Detail body text')).toBeInTheDocument();
    expect(windowHandler).toHaveBeenCalled();

    document.body.removeChild(otherWidget);
    window.removeEventListener('keydown', windowHandler);
  });
});
