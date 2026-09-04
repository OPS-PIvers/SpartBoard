import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditorModalShell } from '@/components/common/EditorModalShell';

// REGRESSION: LMS iframes (Schoology, Classroom add-on) mount editors with no
// DashboardProvider; the shell must not throw, and save errors must still surface.

const showAlert = vi.fn((_message: string) => Promise.resolve());
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert,
    showConfirm: vi.fn(() => Promise.resolve(true)),
    showPrompt: vi.fn(),
  }),
}));

describe('EditorModalShell without DashboardProvider', () => {
  it('renders and reports a failed save through the dialog', async () => {
    render(
      <EditorModalShell
        isOpen
        title="Grade"
        isDirty
        onSave={() => Promise.reject(new Error('boom'))}
        onClose={() => undefined}
      >
        <div>body</div>
      </EditorModalShell>
    );
    expect(screen.getByText('body')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect(showAlert.mock.calls[0][0]).toMatch(/boom/);
  });
});
