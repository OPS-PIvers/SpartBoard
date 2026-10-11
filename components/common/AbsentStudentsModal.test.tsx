import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AbsentStudentsModal } from './AbsentStudentsModal';
import type { ClassRoster } from '@/types';

const setAbsentStudents = vi.fn();
const addToast = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ setAbsentStudents, addToast }),
}));

const roster = {
  id: 'r1',
  name: 'Period 1',
  students: [{ id: 's1', firstName: 'Ada', lastName: 'Lovelace' }],
} as unknown as ClassRoster;

describe('AbsentStudentsModal', () => {
  afterEach(() => vi.clearAllMocks());

  it('toasts instead of leaking an unhandled rejection when saving fails', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    setAbsentStudents.mockRejectedValue(new Error('offline'));
    render(<AbsentStudentsModal isOpen onClose={vi.fn()} roster={roster} />);
    fireEvent.click(screen.getByText('Ada Lovelace'));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.any(String), 'error')
    );
    await new Promise((r) => setTimeout(r, 10));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
