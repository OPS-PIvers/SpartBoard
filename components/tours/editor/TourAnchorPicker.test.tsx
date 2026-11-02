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
    <span>Plain text</span>
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

  it('picks nothing behind a dialog', () => {
    const { onPick } = setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const text = document.createElement('p');
    dialog.appendChild(text);
    document.body.appendChild(dialog);
    document.elementsFromPoint = () => [
      text,
      dialog,
      screen.getByText('Tools'),
    ];
    fireEvent.click(text);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('outlines a registered anchor on hover and names it', () => {
    setup();
    fireEvent.pointerMove(screen.getByText('Tools'));
    expect(screen.getByTestId('tour-anchor-picker-outline')).toHaveTextContent(
      'Open Tools button in the collapsed dock'
    );
    fireEvent.pointerMove(screen.getByText('Other'));
    expect(screen.getByTestId('tour-anchor-picker-outline')).toHaveTextContent(
      'other'
    );
    fireEvent.pointerMove(screen.getByText('Plain text'));
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

  it('binds an untagged control by its role and name', () => {
    boardClick.mockClear();
    const { onPick } = setup();
    fireEvent.click(screen.getByText('Other'));
    expect(onPick).toHaveBeenCalledWith({
      anchor: '',
      fallback: { role: 'button', name: 'other' },
    });
    expect(boardClick).not.toHaveBeenCalled();
  });

  it('ignores clicks on things that are not controls', () => {
    const { onPick } = setup();
    fireEvent.click(screen.getByText('Plain text'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Alt', { altKey: true }],
  ])('lets a %s click act on the control instead of binding it', (_, mod) => {
    boardClick.mockClear();
    const { onPick } = setup();
    fireEvent.click(screen.getByText('Tools'), mod);
    expect(boardClick).toHaveBeenCalledTimes(1);
    // The app sees a plain click, so modifier-aware controls still open.
    expect(boardClick.mock.calls[0][0]).toMatchObject({
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('keeps a Ctrl-opened menu open and picks an item in it', () => {
    const Menu = () => {
      const [open, setOpen] = React.useState(false);
      React.useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('pointerdown', close);
        return () => {
          document.removeEventListener('mousedown', close);
          document.removeEventListener('pointerdown', close);
        };
      }, [open]);
      return (
        <>
          <button type="button" aria-label="More" onClick={() => setOpen(true)}>
            ...
          </button>
          {open && (
            <button type="button" role="menuitem" data-tour="dock.open-tools">
              Publish
            </button>
          )}
        </>
      );
    };
    const onPick = vi.fn();
    render(
      <>
        <Menu />
        <TourAnchorPicker onPick={onPick} onCancel={vi.fn()} />
      </>
    );
    const more = screen.getByRole('button', { name: 'More' });
    fireEvent.pointerDown(more, { ctrlKey: true });
    fireEvent.mouseDown(more, { ctrlKey: true });
    fireEvent.click(more, { ctrlKey: true });
    const item = screen.getByRole('menuitem');
    fireEvent.pointerDown(item);
    fireEvent.mouseDown(item);
    fireEvent.click(item);
    expect(screen.getByRole('menuitem')).toBeInTheDocument();
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: 'dock.open-tools' })
    );
  });

  it('sends a Ctrl click through the tour dim to the control under it', () => {
    boardClick.mockClear();
    const { onPick } = setup();
    const layer = document.createElement('div');
    layer.setAttribute('data-tour-ignore', '');
    const dim = document.createElement('div');
    dim.setAttribute('data-tour-overlay', '');
    layer.appendChild(dim);
    document.body.appendChild(layer);
    document.elementsFromPoint = () => [dim, screen.getByText('Tools')];
    fireEvent.click(dim, { ctrlKey: true });
    expect(boardClick).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    layer.remove();
  });

  it('keeps a press whole when Ctrl is pressed or let go midway', () => {
    boardClick.mockClear();
    const { onPick } = setup();
    const tools = screen.getByText('Tools');
    fireEvent.pointerDown(tools, { ctrlKey: true });
    fireEvent.click(tools);
    expect(boardClick).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.pointerDown(tools);
    fireEvent.click(tools, { ctrlKey: true });
    expect(boardClick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('never passes a right click through', () => {
    const onMenu = vi.fn();
    const { onPick } = setup();
    const tools = screen.getByText('Tools');
    tools.addEventListener('contextmenu', onMenu);
    fireEvent.contextMenu(tools, { ctrlKey: true, button: 2 });
    expect(onMenu).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('does not follow a link on a Ctrl click', () => {
    const follow = vi.fn((e: MouseEvent) => e.preventDefault());
    const { onPick } = setup();
    const link = document.createElement('a');
    link.href = '#elsewhere';
    link.textContent = 'Link';
    link.addEventListener('click', follow);
    document.body.appendChild(link);
    fireEvent.click(link, { ctrlKey: true });
    expect(follow).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
    link.remove();
  });

  it('shows the Ctrl hint', () => {
    setup();
    expect(
      screen.getByText('Hold Ctrl and click to open a menu first')
    ).toBeInTheDocument();
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
