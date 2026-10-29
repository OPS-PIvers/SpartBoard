import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

afterEach(cleanup);

const resolve = vi.fn();
let dialog: Record<string, unknown>;

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ currentDialog: dialog }),
}));

import { DialogContainer } from '@/components/common/DialogContainer';

describe('DialogContainer - IME composition keys', () => {
  it.each([
    ['alert', { kind: 'alert', message: 'Hi', options: {}, resolve }],
    [
      'confirm',
      {
        kind: 'confirm',
        message: 'Go?',
        options: { variant: 'info' },
        resolve,
      },
    ],
  ])('%s ignores Enter/Escape that belong to an IME composition', (_n, d) => {
    resolve.mockClear();
    dialog = d;
    render(
      <div>
        <input data-testid="outside" />
        <DialogContainer />
      </div>
    );
    const input = document.querySelector('input') as HTMLElement;
    for (const init of [
      { key: 'Enter', isComposing: true },
      { key: 'Enter', keyCode: 229 },
      { key: 'Escape', isComposing: true },
    ]) {
      fireEvent.keyDown(input, init);
    }
    expect(resolve).not.toHaveBeenCalled();
  });
});
