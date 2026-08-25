import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

// Local, controllable useDialog mock (overrides the global stub in tests/setup.ts)
// so we can flip DialogContainer's currentDialog on demand — the global mock
// omits currentDialog, which would keep DialogContainer permanently closed.
let mockCurrentDialog: {
  id: string;
  kind: 'confirm';
  message: string;
  options: Record<string, unknown>;
  resolve: (v: boolean) => void;
} | null = null;

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: mockCurrentDialog,
    showAlert: vi.fn(),
    showConfirm: vi.fn(),
    showPrompt: vi.fn(),
  }),
}));

import { Modal } from '@/components/common/Modal';
import { DialogContainer } from '@/components/common/DialogContainer';
import { getBodyScrollLockCount } from '@/components/common/bodyScrollLock';

const noop = vi.fn();

const Tree: React.FC = () => (
  <>
    <Modal isOpen onClose={noop} title="Host Modal">
      <div>modal body</div>
    </Modal>
    <DialogContainer />
  </>
);

describe('body scroll lock shared between Modal and DialogContainer', () => {
  afterEach(() => {
    mockCurrentDialog = null;
    cleanup();
    delete (document.body.style as { overflow?: string }).overflow;
    document.body.style.overflow = '';
  });

  // Regression: Modal and DialogContainer each kept an INDEPENDENT scroll-lock
  // counter, both writing document.body.style.overflow directly. A confirm
  // dialog opened from inside a modal (e.g. a delete confirmation) would, on
  // close, drop the DIALOG counter to 0 and set overflow='unset' — unlocking
  // the page while the modal underneath was still open. Fix: a single shared
  // bodyScrollLock counter releases the page only when the LAST overlay closes.
  it('keeps the page scroll-locked when a dialog opened over a modal closes', () => {
    expect(getBodyScrollLockCount()).toBe(0);

    // 1. Modal only → page locked.
    mockCurrentDialog = null;
    const { rerender } = render(<Tree />);
    expect(document.body.style.overflow).toBe('hidden');

    // 2. Confirm dialog opens over the modal → still locked.
    mockCurrentDialog = {
      id: 'd1',
      kind: 'confirm',
      message: 'Delete this item?',
      options: {},
      resolve: vi.fn(),
    };
    rerender(<Tree />);
    expect(document.body.style.overflow).toBe('hidden');

    // 3. Only the dialog closes; the modal stays open underneath.
    mockCurrentDialog = null;
    rerender(<Tree />);

    // KEY ASSERTION: modal still open → page must remain locked.
    // Pre-fix this was 'unset' (the dialog's own counter released the lock).
    expect(document.body.style.overflow).toBe('hidden');
  });
});
