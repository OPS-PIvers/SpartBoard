import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TourShellOutline } from './TourEditorShell';
import type { TourShellAdapter } from './types';

const ROW = 40;
const VIEW = 200;

const adapterFor = (selected: number): TourShellAdapter => ({
  kind: 'live',
  title: 'Tour',
  saveState: 'saved',
  publish: 'draft',
  main: { state: 'publish', disabled: false, blocker: null },
  onMain: vi.fn(),
  menu: [],
  steps: Array.from({ length: 14 }, (_, i) => ({
    id: `s${i}`,
    title: `Step ${i + 1}`,
  })),
  selected,
  onSelect: vi.fn(),
  onMove: vi.fn(),
  renderCard: (stepId) => <input aria-label={`Title ${stepId}`} />,
});

// jsdom has no layout: rows sit ROW apart, the outline shows VIEW px from its scrollTop.
const fakeLayout = (scrollBy: ReturnType<typeof vi.fn>) => {
  const ol = screen.getByTestId('tour-editor-outline');
  ol.getBoundingClientRect = () => ({ top: 0, bottom: VIEW }) as DOMRect;
  ol.scrollBy = scrollBy as unknown as typeof ol.scrollBy;
  Array.from(ol.children).forEach((row, i) => {
    (row as HTMLElement).getBoundingClientRect = () =>
      ({ top: i * ROW, bottom: (i + 1) * ROW }) as DOMRect;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TourShellOutline', () => {
  it('scrolls a newly selected row into view inside the outline', () => {
    const scrollBy = vi.fn();
    const { rerender } = render(<TourShellOutline adapter={adapterFor(0)} />);
    fakeLayout(scrollBy);
    rerender(<TourShellOutline adapter={adapterFor(12)} />);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({
      top: 13 * ROW - VIEW,
      behavior: 'smooth',
    });
  });

  it('leaves a row that is already visible alone', () => {
    const scrollBy = vi.fn();
    const { rerender } = render(<TourShellOutline adapter={adapterFor(0)} />);
    fakeLayout(scrollBy);
    rerender(<TourShellOutline adapter={adapterFor(2)} />);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('does not scroll while a field in the open card has focus', () => {
    const scrollBy = vi.fn();
    const { rerender } = render(<TourShellOutline adapter={adapterFor(0)} />);
    fakeLayout(scrollBy);
    // A field that stays mounted inside the outline, as while typing in the open card.
    const field = document.createElement('textarea');
    screen.getByTestId('tour-editor-outline').appendChild(field);
    field.focus();
    rerender(<TourShellOutline adapter={adapterFor(12)} />);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('jumps without smooth scrolling under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({ matches: true, media: query }) as MediaQueryList
    );
    const scrollBy = vi.fn();
    const { rerender } = render(<TourShellOutline adapter={adapterFor(0)} />);
    fakeLayout(scrollBy);
    rerender(<TourShellOutline adapter={adapterFor(12)} />);
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' })
    );
  });
});
