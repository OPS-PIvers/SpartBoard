import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchoologyCategoriesPanel } from './SchoologyCategoriesPanel';

const getDocMock = vi.fn();
const setDocMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: (...a: unknown[]) => getDocMock(...a) as unknown,
  setDoc: (...a: unknown[]) => setDocMock(...a) as unknown,
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

describe('SchoologyCategoriesPanel', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    setDocMock.mockReset();
  });

  it('does not offer editable defaults when the saved doc fails to load', async () => {
    getDocMock.mockRejectedValueOnce(new Error('offline'));
    render(<SchoologyCategoriesPanel />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByLabelText('Category 1 name')).toBeNull();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('loads the saved categories after a retry', async () => {
    getDocMock.mockRejectedValueOnce(new Error('offline'));
    getDocMock.mockResolvedValueOnce({
      data: () => ({ categories: [{ title: 'Quizzes', weight: 100 }] }),
    });
    render(<SchoologyCategoriesPanel />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Try again' })
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Category 1 name')).toHaveValue('Quizzes')
    );
  });
});
