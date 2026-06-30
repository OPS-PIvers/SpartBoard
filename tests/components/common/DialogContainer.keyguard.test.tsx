import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

afterEach(cleanup);

const mockResolve = vi.fn();

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: {
      kind: 'alert',
      message: 'Test',
      options: { variant: 'info' },
      resolve: mockResolve,
    },
    showAlert: vi.fn(),
    showConfirm: vi.fn(),
    showPrompt: vi.fn(),
  }),
}));

import * as domHelpers from '@/utils/domHelpers';
import { DialogContainer } from '@/components/common/DialogContainer';

describe('DialogContainer — key-check guard ordering', () => {
  it('does not call isEscapeFromWidgetInput for non-Escape/Enter keys (e.g. Tab)', () => {
    const spy = vi.spyOn(domHelpers, 'isEscapeFromWidgetInput');
    render(<DialogContainer />);

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      })
    );

    // Key check must short-circuit before reaching the DOM-traversal guard
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
