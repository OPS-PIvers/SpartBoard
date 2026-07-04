import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';

afterEach(cleanup);

describe('FolderPickerPopover — Escape key from widget portal', () => {
  it('does not call onClose when Escape originates from inside a [data-widget-portal] element', () => {
    const onClose = vi.fn();

    render(
      <FolderPickerPopover
        folders={[]}
        selectedFolderId={null}
        onSelect={vi.fn()}
        onClose={onClose}
        variant="dialog"
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

  it('calls onClose when Escape originates from outside a widget portal', () => {
    const onClose = vi.fn();

    render(
      <FolderPickerPopover
        folders={[]}
        selectedFolderId={null}
        onSelect={vi.fn()}
        onClose={onClose}
        variant="dialog"
      />
    );

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
