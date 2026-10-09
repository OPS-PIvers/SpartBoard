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
    expect(options[0]).toHaveTextContent('Open Tools button');
    expect(options[0].getAttribute('title')).toContain('dock.open-tools');
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
    expect(current).toHaveTextContent('Widget button');
    fireEvent.click(current);
    expect(onPick).toHaveBeenCalledWith({ anchor: 'dock.item:clock' });
  });

  it('carries the widget type to another per-type anchor but not to a plain one', () => {
    const onPick = vi.fn();
    render(<TourAnchorList value="dock.item:clock" onPick={onPick} />);
    fireEvent.change(search(), { target: { value: 'library.item-hide' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith({
      anchor: 'library.item-hide:clock',
    });
    fireEvent.change(search(), { target: { value: 'dock.open-tools' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith({ anchor: 'dock.open-tools' });
  });

  it('lists controls on screen first, named by their own words, with their widget', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<div data-tour="widget.window" data-tour-widget="w1" data-tour-widget-type="time-tool">' +
      '<button data-tour="time-tool.start-pause" aria-label="Play">Play</button></div>';
    document.body.appendChild(host);
    const rect = {
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      top: 10,
      left: 10,
      right: 50,
      bottom: 30,
    };
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ ...rect, toJSON: () => rect } as DOMRect);
    const onPick = vi.fn();
    render(<TourAnchorList onPick={onPick} />);
    expect(screen.getByText('On screen')).toBeInTheDocument();
    expect(screen.getByText('Everywhere else')).toBeInTheDocument();
    const play = screen.getByRole('option', { name: /^Play/ });
    expect(play).toHaveTextContent('Timer');
    fireEvent.click(play);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: 'time-tool.start-pause' })
    );
    spy.mockRestore();
    host.remove();
  });

  it('keeps other areas collapsed until searched', () => {
    render(<TourAnchorList onPick={vi.fn()} />);
    const teams = screen.getByRole('button', { name: /^Teams/ });
    expect(teams).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(teams);
    expect(teams).toHaveAttribute('aria-expanded', 'true');
  });
});
