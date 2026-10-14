import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { Modal } from '@/components/common/Modal';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn(() => Promise.resolve(true)),
    showPrompt: vi.fn(),
  }),
}));

const shell = (onClose = vi.fn()) => (
  <EditorModalShell
    isOpen
    title="Grade"
    isDirty={false}
    onSave={() => undefined}
    onClose={onClose}
  >
    <div>body</div>
  </EditorModalShell>
);

const panel = () =>
  document.querySelector('[role="dialog"] > div') as HTMLElement;

describe('full-screen toggle on large modals', () => {
  it('fills the viewport, and Escape leaves full screen before closing', () => {
    const onClose = vi.fn();
    render(shell(onClose));
    fireEvent.click(screen.getByRole('button', { name: 'View full screen' }));
    expect(panel().getAttribute('data-fullscreen')).toBe('true');
    expect(panel().className).toContain('!h-full');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(panel().hasAttribute('data-fullscreen')).toBe(false);
    expect(
      screen.getByRole('button', { name: 'View full screen' })
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is opt-in on the plain Modal', () => {
    const { rerender } = render(
      <Modal isOpen onClose={vi.fn()} title="Plain">
        <div>x</div>
      </Modal>
    );
    expect(
      screen.queryByRole('button', { name: 'View full screen' })
    ).toBeNull();
    rerender(
      <Modal isOpen onClose={vi.fn()} title="Plain" allowFullscreen>
        <div>x</div>
      </Modal>
    );
    fireEvent.click(screen.getByRole('button', { name: 'View full screen' }));
    expect(panel().getAttribute('data-fullscreen')).toBe('true');
  });
});
