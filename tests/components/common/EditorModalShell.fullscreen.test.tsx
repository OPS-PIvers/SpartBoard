import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { Modal } from '@/components/common/Modal';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn(() => Promise.resolve(true)),
    showPrompt: vi.fn(),
  }),
}));

const withFlag = (enabled: boolean, ui: React.ReactElement) => (
  <AuthContext.Provider
    value={{ canAccessFeature: () => enabled } as unknown as AuthContextType}
  >
    {ui}
  </AuthContext.Provider>
);

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
  it('is hidden while the flag is off', () => {
    render(withFlag(false, shell()));
    expect(
      screen.queryByRole('button', { name: 'View full screen' })
    ).toBeNull();
  });

  it('is hidden with no auth provider (student and LMS routes)', () => {
    render(shell());
    expect(
      screen.queryByRole('button', { name: 'View full screen' })
    ).toBeNull();
  });

  it('fills the viewport, and Escape leaves full screen before closing', () => {
    const onClose = vi.fn();
    render(withFlag(true, shell(onClose)));
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
      withFlag(
        true,
        <Modal isOpen onClose={vi.fn()} title="Plain">
          <div>x</div>
        </Modal>
      )
    );
    expect(
      screen.queryByRole('button', { name: 'View full screen' })
    ).toBeNull();
    rerender(
      withFlag(
        true,
        <Modal isOpen onClose={vi.fn()} title="Plain" allowFullscreen>
          <div>x</div>
        </Modal>
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'View full screen' }));
    expect(panel().getAttribute('data-fullscreen')).toBe('true');
  });
});
