import React, { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Viewer } from './Viewer';
import { NotebookItem } from '@/types';

const notebook = (hiddenPages?: number[]): NotebookItem => ({
  id: 'nb-1',
  title: 'Unit 3',
  pageUrls: Array.from({ length: 6 }, (_, i) => `http://example.com/p${i}.svg`),
  pagePaths: Array.from({ length: 6 }, (_, i) => `path/p${i}.svg`),
  createdAt: 0,
  ...(hiddenPages ? { hiddenPages } : {}),
});

// Controlled harness: the real Widget owns currentPage, so mirror that here.
const Harness: React.FC<{ hiddenPages?: number[]; startPage?: number }> = ({
  hiddenPages,
  startPage = 0,
}) => {
  const [page, setPage] = useState(startPage);
  return (
    <Viewer
      activeNotebook={notebook(hiddenPages)}
      hasAssets={false}
      showAssets={false}
      setShowAssets={vi.fn()}
      handleClose={vi.fn()}
      currentPage={page}
      setCurrentPage={setPage}
      handleDragStart={vi.fn()}
      placedAssets={[]}
      onPlaceAsset={vi.fn()}
      onUpdatePlacedAsset={vi.fn()}
      onRemovePlacedAsset={vi.fn()}
    />
  );
};

const counterText = () => screen.getByTitle('Jump to page').textContent ?? '';
const nextButton = () => {
  const buttons = screen.getAllByRole('button');
  return buttons[buttons.length - 1];
};

describe('Viewer hidden pages', () => {
  // jsdom has no scrollIntoView; the jump menu calls it on open.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('counts only visible pages', () => {
    render(<Harness hiddenPages={[2]} />);
    expect(screen.getByText(/Page 1 of 5/)).toBeInTheDocument();
    expect(counterText()).toContain('1 / 5');
  });

  it('skips hidden pages when stepping forward', () => {
    render(<Harness hiddenPages={[1, 2]} />);
    fireEvent.click(nextButton());
    expect(screen.getByAltText('Page 4')).toBeInTheDocument();
  });

  it('shows the hidden badge on a deliberately-opened hidden page', () => {
    render(<Harness hiddenPages={[1]} startPage={1} />);
    expect(screen.getAllByText('Hidden page').length).toBeGreaterThan(0);
  });

  it('steps from a hidden page to the adjacent visible page', () => {
    render(<Harness hiddenPages={[1]} startPage={1} />);
    fireEvent.click(nextButton());
    expect(screen.getByAltText('Page 3')).toBeInTheDocument();
  });

  it('shows every page when all of them are hidden', () => {
    render(<Harness hiddenPages={[0, 1, 2, 3, 4, 5]} />);
    expect(screen.getByText(/Page 1 of 6/)).toBeInTheDocument();
  });

  it('lists hidden pages in the jump menu with an accessible label', () => {
    render(<Harness hiddenPages={[2]} />);
    fireEvent.click(screen.getByTitle('Jump to page'));
    const menu = screen.getByRole('dialog', { name: 'Jump to page' });
    expect(
      within(menu).getByRole('button', { name: 'Go to page 3 (hidden)' })
    ).toBeInTheDocument();
  });
});

describe('Viewer zoom controls', () => {
  const zoomLabel = () =>
    screen.getByLabelText('Reset zoom to fit').textContent;

  it('exposes labelled zoom buttons and the current percentage', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
    expect(zoomLabel()).toBe('100%');
  });

  it('steps in, steps out and resets to fit', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Zoom out')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(zoomLabel()).toBe('125%');
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(zoomLabel()).toBe('156%');

    fireEvent.click(screen.getByLabelText('Reset zoom to fit'));
    expect(zoomLabel()).toBe('100%');
    expect(screen.getByLabelText('Zoom out')).toBeDisabled();
  });

  it('zooms on Ctrl + wheel over the page but not on a plain wheel', () => {
    render(<Harness />);
    const page = screen.getByAltText('Page 1').parentElement as HTMLElement;

    fireEvent.wheel(page, { deltaY: -100 });
    expect(zoomLabel()).toBe('100%');

    fireEvent.wheel(page, { deltaY: -100, ctrlKey: true });
    expect(zoomLabel()).not.toBe('100%');
  });

  it('returns to fit when the page changes', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(zoomLabel()).toBe('125%');
    fireEvent.click(nextButton());
    expect(zoomLabel()).toBe('100%');
  });
});
