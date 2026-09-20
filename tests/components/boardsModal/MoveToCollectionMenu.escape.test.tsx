import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

import { MoveToCollectionMenu } from '@/components/boardsModal/MoveToCollectionMenu';

afterEach(cleanup);

describe('MoveToCollectionMenu — Escape', () => {
  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <MoveToCollectionMenu
        collections={[]}
        onMove={vi.fn()}
        onClose={onClose}
      />
    );

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // BoardsModal registers its own document-level Escape handler on mount,
  // before this popover ever opens — so a plain bubble-phase listener here
  // would lose the race and let BoardsModal's handler run first, closing
  // the whole Boards & Collections modal instead of just this popover.
  // Matches the capture-phase pattern CollectionColorPicker already uses.
  it('wins over an outer document Escape listener registered before it mounts', () => {
    const outerClose = vi.fn();
    const outerHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') outerClose();
    };
    document.addEventListener('keydown', outerHandler);

    const onClose = vi.fn();
    render(
      <MoveToCollectionMenu
        collections={[]}
        onMove={vi.fn()}
        onClose={onClose}
      />
    );

    try {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(outerClose).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', outerHandler);
    }
  });

  it('does not call onClose when Escape originates from inside a [data-widget-portal] element', () => {
    const onClose = vi.fn();
    render(
      <MoveToCollectionMenu
        collections={[]}
        onMove={vi.fn()}
        onClose={onClose}
      />
    );

    const portalRoot = document.createElement('div');
    portalRoot.setAttribute('data-widget-portal', '');
    const inner = document.createElement('button');
    portalRoot.appendChild(inner);
    document.body.appendChild(portalRoot);

    try {
      inner.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      );
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(portalRoot);
    }
  });
});
