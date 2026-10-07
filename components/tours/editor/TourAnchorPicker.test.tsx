import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchAutoClick } from '@/components/tours/autopilot';
import { TourAnchorPicker } from './TourAnchorPicker';

const board = () => (
  <div>
    <button type="button" data-tour="dock.open-tools" onClick={boardClick}>
      Tools
    </button>
    <button type="button" data-tour="not.registered" onClick={boardClick}>
      Other
    </button>
  </div>
);
const boardClick = vi.fn();

const setup = (
  props: Partial<React.ComponentProps<typeof TourAnchorPicker>> = {}
) => {
  const onPick = vi.fn();
  const onCancel = vi.fn();
  render(
    <>
      {board()}
      <TourAnchorPicker onPick={onPick} onCancel={onCancel} {...props} />
    </>
  );
  return { onPick, onCancel };
};

describe('TourAnchorPicker', () => {
  // jsdom has no hit testing; an empty stack falls back to the event target.
  beforeEach(() => {
    document.elementsFromPoint = () => [];
  });

  it('looks through the tour dim layer at the control under it', () => {
    const { onPick } = setup();
    const layer = document.createElement('div');
    layer.setAttribute('data-tour-ignore', '');
    const dim = document.createElement('div');
    dim.setAttribute('data-tour-overlay', '');
    layer.appendChild(dim);
    document.body.appendChild(layer);
    document.elementsFromPoint = () => [dim, screen.getByText('Tools')];
    fireEvent.click(dim);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: 'dock.open-tools' })
    );
  });

  it('picks nothing under the editor panel', () => {
    const { onPick } = setup();
    const panel = document.createElement('div');
    panel.setAttribute('data-tour-ignore', '');
    document.body.appendChild(panel);
    document.elementsFromPoint = () => [panel, screen.getByText('Tools')];
    fireEvent.click(screen.getByText('Tools'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('outlines a registered anchor on hover and names it', () => {
    setup();
    fireEvent.pointerMove(screen.getByText('Tools'));
    expect(screen.getByTestId('tour-anchor-picker-outline')).toHaveTextContent(
      'Open Tools button in the collapsed dock'
    );
    fireEvent.pointerMove(screen.getByText('Other'));
    expect(screen.queryByTestId('tour-anchor-picker-outline')).toBeNull();
  });

  it('binds the clicked anchor without clicking the control', () => {
    boardClick.mockClear();
    const { onPick } = setup();
    fireEvent.click(screen.getByText('Tools'));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: 'dock.open-tools' })
    );
    expect(boardClick).not.toHaveBeenCalled();
  });

  it('ignores clicks on unregistered controls', () => {
    boardClick.mockClear();
    const { onPick } = setup();
    fireEvent.click(screen.getByText('Other'));
    expect(onPick).not.toHaveBeenCalled();
    expect(boardClick).not.toHaveBeenCalled();
  });

  it('cancels on Escape and from its bar', () => {
    const { onCancel } = setup();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('offers the list when asked', () => {
    const onChooseFromList = vi.fn();
    setup({ onChooseFromList });
    fireEvent.click(screen.getByRole('button', { name: 'Choose from list' }));
    expect(onChooseFromList).toHaveBeenCalled();
  });

  it('lets scripted clicks through to the board', () => {
    boardClick.mockClear();
    const { onPick } = setup();
    dispatchAutoClick(screen.getByText('Tools'));
    expect(boardClick).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', () => {
    boardClick.mockClear();
    const onPick = vi.fn();
    const { unmount } = render(
      <TourAnchorPicker onPick={onPick} onCancel={vi.fn()} />
    );
    unmount();
    render(board());
    fireEvent.click(screen.getByText('Tools'));
    expect(boardClick).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });
});
