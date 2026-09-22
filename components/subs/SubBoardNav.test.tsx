import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SubBoardNav } from './SubBoardNav';
import { buildSubShareNav } from './subShareNav';

const label = (id: string) => `Board ${id}`;

const nav = buildSubShareNav(
  {
    boardIds: ['b1', 'b2', 'b3'],
    boards: [
      { id: 'b1', name: 'Warm up', sectionId: 'root', order: 0 },
      { id: 'b2', name: 'Reading', sectionId: 'unit-1', order: 0 },
      { id: 'b3', name: 'Exit ticket', sectionId: 'unit-1', order: 1 },
    ],
    sections: [
      { id: 'root', name: '' },
      { id: 'unit-1', name: 'Unit 1' },
    ],
    defaultBoardId: 'b1',
  },
  label
);

const onPick = vi.fn();

const renderNav = (currentBoardId: string) =>
  render(
    <SubBoardNav
      nav={nav}
      currentBoardId={currentBoardId}
      onPickBoard={onPick}
    />
  );

describe('SubBoardNav', () => {
  beforeEach(() => {
    onPick.mockClear();
  });

  // Nowhere to go, so the cluster would only be chrome in the sub's way.
  it('renders nothing for a share with one board', () => {
    const one = buildSubShareNav(
      { boardIds: ['b1'] } as Parameters<typeof buildSubShareNav>[0],
      label
    );
    const { container } = render(
      <SubBoardNav nav={one} currentBoardId="b1" onPickBoard={onPick} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows where the sub is in the collection', () => {
    renderNav('b2');
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  it('steps to the previous and next board', () => {
    renderNav('b2');
    fireEvent.click(screen.getByRole('button', { name: 'Previous board' }));
    expect(onPick).toHaveBeenCalledWith('b1');
    fireEvent.click(screen.getByRole('button', { name: 'Next board' }));
    expect(onPick).toHaveBeenCalledWith('b3');
  });

  it('disables the step buttons at each end', () => {
    renderNav('b1');
    expect(
      screen.getByRole('button', { name: 'Previous board' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next board' })).toBeEnabled();
  });

  it('lists the boards under their section headings', () => {
    renderNav('b1');
    fireEvent.click(
      screen.getByRole('button', { name: "This teacher's boards" })
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Unit 1')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(
      ['Warm upOpen', 'Reading', 'Exit ticket']
    );
  });

  // A colour alone would not say which board is open (see the design notes).
  it('marks the open board for assistive tech and in words', () => {
    renderNav('b2');
    fireEvent.click(
      screen.getByRole('button', { name: "This teacher's boards" })
    );
    const open = screen.getByRole('menuitem', { name: /Reading/ });
    expect(open).toHaveAttribute('aria-current', 'true');
    expect(open).toHaveTextContent('Open');
  });

  it('picks a board from the menu and closes it', () => {
    renderNav('b1');
    fireEvent.click(
      screen.getByRole('button', { name: "This teacher's boards" })
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Exit ticket/ }));
    expect(onPick).toHaveBeenCalledWith('b3');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not re-pick the board already open', () => {
    renderNav('b1');
    fireEvent.click(
      screen.getByRole('button', { name: "This teacher's boards" })
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Warm up/ }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('pages with the arrow keys', () => {
    renderNav('b2');
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onPick).toHaveBeenCalledWith('b1');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onPick).toHaveBeenCalledWith('b3');
  });

  it('stops at the ends rather than wrapping around', () => {
    renderNav('b1');
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onPick).not.toHaveBeenCalled();
  });

  // Otherwise an arrow inside a widget's text field would move the board.
  it('leaves the arrow keys to whatever the sub is typing in', () => {
    renderNav('b2');
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(onPick).not.toHaveBeenCalled();
    input.remove();
  });

  it('leaves a modified arrow alone', () => {
    renderNav('b2');
    fireEvent.keyDown(document, { key: 'ArrowRight', metaKey: true });
    expect(onPick).not.toHaveBeenCalled();
  });

  // While the list is open the arrows belong to the list, not the board.
  it('does not page while the board list is open', () => {
    renderNav('b2');
    fireEvent.click(
      screen.getByRole('button', { name: "This teacher's boards" })
    );
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('closes the board list on Escape', () => {
    renderNav('b2');
    fireEvent.click(
      screen.getByRole('button', { name: "This teacher's boards" })
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // A pre-v2 share has no section names, so it must not render empty headings.
  it('renders a pre-v2 share as one flat list', () => {
    const flat = buildSubShareNav(
      { boardIds: ['x1', 'x2'] } as Parameters<typeof buildSubShareNav>[0],
      label
    );
    render(<SubBoardNav nav={flat} currentBoardId="x1" onPickBoard={onPick} />);
    fireEvent.click(
      screen.getByRole('button', { name: "This teacher's boards" })
    );
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(
      screen.getByRole('menuitem', { name: /Board x2/ })
    ).toBeInTheDocument();
  });
});
