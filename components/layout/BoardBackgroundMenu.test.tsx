import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Clipboard, Undo2 } from 'lucide-react';
import { BoardBackgroundMenu } from './BoardBackgroundMenu';
import { isBoardBackgroundTarget } from './boardMenuUtils';

describe('isBoardBackgroundTarget', () => {
  const build = () => {
    document.body.innerHTML = `
      <div id="dashboard-root">
        <div data-board-background><iframe></iframe></div>
        <div id="dashboard-zoom-surface">
          <div data-board-surface>
            <div data-board-id="b1"><div class="widget"><button>x</button></div></div>
          </div>
        </div>
        <nav><button id="dock-btn">Dock</button></nav>
      </div>`;
  };

  it('accepts empty board layers', () => {
    build();
    for (const sel of [
      '#dashboard-root',
      '[data-board-background]',
      '[data-board-background] iframe',
      '#dashboard-zoom-surface',
      '[data-board-surface]',
      '[data-board-id]',
    ]) {
      expect(isBoardBackgroundTarget(document.querySelector(sel))).toBe(true);
    }
  });

  it('rejects widgets and app chrome', () => {
    build();
    expect(isBoardBackgroundTarget(document.querySelector('.widget'))).toBe(
      false
    );
    expect(
      isBoardBackgroundTarget(document.querySelector('.widget button'))
    ).toBe(false);
    expect(isBoardBackgroundTarget(document.querySelector('#dock-btn'))).toBe(
      false
    );
    expect(isBoardBackgroundTarget(null)).toBe(false);
  });
});

describe('BoardBackgroundMenu', () => {
  it('runs an item, closes, and skips disabled items', () => {
    const paste = vi.fn();
    const undo = vi.fn();
    const onClose = vi.fn();
    render(
      <BoardBackgroundMenu
        position={{ x: 10, y: 10 }}
        onClose={onClose}
        items={[
          {
            id: 'paste',
            label: 'Paste',
            icon: Clipboard,
            tour: {},
            action: paste,
          },
          {
            id: 'undo',
            label: 'Undo',
            icon: Undo2,
            tour: {},
            action: undo,
            disabled: true,
            groupStart: true,
          },
        ]}
      />
    );
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo' }));
    expect(undo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }));
    expect(paste).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
