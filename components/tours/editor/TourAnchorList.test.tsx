import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TourAnchorList } from './TourAnchorList';

const search = () => screen.getByRole('combobox', { name: 'Search controls' });

describe('TourAnchorList', () => {
  it('lists Whole board first', () => {
    render(<TourAnchorList onPick={vi.fn()} />);
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Whole board');
  });

  it('filters by label and id words', () => {
    render(<TourAnchorList onPick={vi.fn()} />);
    fireEvent.change(search(), { target: { value: 'open tools dock' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('dock.open-tools');
    fireEvent.change(search(), { target: { value: 'zzzz-nothing' } });
    expect(screen.getByText('No controls match')).toBeInTheDocument();
  });

  it('picks with the mouse or the keyboard', () => {
    const onPick = vi.fn();
    render(<TourAnchorList onPick={onPick} />);
    fireEvent.click(screen.getByText('Whole board'));
    expect(onPick).toHaveBeenLastCalledWith({ anchor: 'board.whole' });
    fireEvent.change(search(), { target: { value: 'dock.open-tools' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith({ anchor: 'dock.open-tools' });
  });

  it('marks the current anchor and keeps its widget type when re-chosen', () => {
    const onPick = vi.fn();
    render(<TourAnchorList value="dock.item:clock" onPick={onPick} />);
    const current = screen.getByRole('option', { selected: true });
    expect(current).toHaveTextContent('dock.item');
    fireEvent.click(current);
    expect(onPick).toHaveBeenCalledWith({ anchor: 'dock.item:clock' });
  });

  it('carries the widget type to another per-type anchor but not to a plain one', () => {
    const onPick = vi.fn();
    render(<TourAnchorList value="dock.item:clock" onPick={onPick} />);
    fireEvent.change(search(), { target: { value: 'library.item' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith({ anchor: 'library.item:clock' });
    fireEvent.change(search(), { target: { value: 'dock.open-tools' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith({ anchor: 'dock.open-tools' });
  });
});
