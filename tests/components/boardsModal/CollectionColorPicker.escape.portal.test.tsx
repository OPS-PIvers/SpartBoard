import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

import { CollectionColorPicker } from '@/components/boardsModal/CollectionColorPicker';

afterEach(cleanup);

describe('CollectionColorPicker — Escape with widget portal', () => {
  it('does not call onClose when Escape originates from inside a [data-widget-portal] element', () => {
    const onClose = vi.fn();
    render(
      <CollectionColorPicker
        collectionName="Test"
        onSelect={vi.fn()}
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

  it('calls onClose when Escape originates from a non-portal element', () => {
    const onClose = vi.fn();
    render(
      <CollectionColorPicker
        collectionName="Test"
        onSelect={vi.fn()}
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
});
