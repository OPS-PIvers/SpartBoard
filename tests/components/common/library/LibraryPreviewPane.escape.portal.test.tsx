import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { LibraryPreviewPane } from '@/components/common/library/LibraryPreviewPane';

afterEach(cleanup);

describe('LibraryPreviewPane — Escape with widget portal', () => {
  it('does not call onClose when Escape originates from inside a [data-widget-portal] element', () => {
    const onClose = vi.fn();
    render(
      <LibraryPreviewPane isOpen onClose={onClose} title="Preview">
        <div>body</div>
      </LibraryPreviewPane>
    );

    // Simulate a nested portal dialog (e.g. ConfirmDialog) inside the pane
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
      <LibraryPreviewPane isOpen onClose={onClose} title="Preview">
        <div>body</div>
      </LibraryPreviewPane>
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
