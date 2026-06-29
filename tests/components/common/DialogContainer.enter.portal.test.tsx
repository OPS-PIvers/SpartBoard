import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

afterEach(cleanup);

// Mock useDialog to serve a controlled current dialog so we can render
// DialogContainer in isolation without a live DialogProvider.
const mockResolve = vi.fn();

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: {
      kind: 'alert',
      message: 'Test alert',
      options: { variant: 'info' },
      resolve: mockResolve,
    },
    showAlert: vi.fn(),
    showConfirm: vi.fn(),
    showPrompt: vi.fn(),
  }),
}));

import { DialogContainer } from '@/components/common/DialogContainer';

describe('DialogContainer AlertDialog — Enter key from widget portal', () => {
  it('does not call resolve when Enter originates from inside a [data-widget-portal] element', () => {
    mockResolve.mockClear();
    render(<DialogContainer />);

    // Simulate a nested portal (e.g. a popover open inside a widget) —
    // Enter from its elements must not confirm the outer alert dialog.
    const portalRoot = document.createElement('div');
    portalRoot.setAttribute('data-widget-portal', '');
    const inner = document.createElement('button');
    portalRoot.appendChild(inner);
    document.body.appendChild(portalRoot);

    try {
      inner.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        })
      );
      expect(mockResolve).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(portalRoot);
    }
  });
});
