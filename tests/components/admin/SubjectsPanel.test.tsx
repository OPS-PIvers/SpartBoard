import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SubjectsPanel } from '@/components/admin/SubjectsPanel';
import { DEFAULT_SUBJECTS } from '@/config/subjects';

const setDoc = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
  Promise.resolve()
);
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => segments.join('/')),
  setDoc: (...args: unknown[]): Promise<void> => setDoc(...args),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useSubjects', () => ({
  useSubjects: () => ({
    subjects: DEFAULT_SUBJECTS,
    active: DEFAULT_SUBJECTS,
    byId: new Map(),
    loading: false,
  }),
}));

describe('SubjectsPanel', () => {
  beforeEach(() => setDoc.mockClear());

  it('refuses to archive catalog subjects', () => {
    render(<SubjectsPanel />);
    expect(
      screen.getByRole('button', { name: 'Archive English Language Arts' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Archive Social Studies' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archive Math' })).toBeEnabled();
  });

  it('archives an editable subject and keeps the rest intact', async () => {
    render(<SubjectsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Math' }));
    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
    const [path, payload] = setDoc.mock.calls[0] as [
      string,
      { subjects: Array<{ id: string; archived?: boolean }> },
    ];
    expect(path).toBe('admin_settings/subjects');
    expect(payload.subjects.find((s) => s.id === 'math')?.archived).toBe(true);
    expect(payload.subjects).toHaveLength(DEFAULT_SUBJECTS.length);
  });

  it('adds a subject with a derived, unique id', async () => {
    render(<SubjectsPanel />);
    fireEvent.change(screen.getByLabelText('New content area'), {
      target: { value: 'Math' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
    const [, payload] = setDoc.mock.calls[0] as [
      string,
      { subjects: Array<{ id: string; label: string }> },
    ];
    expect(payload.subjects.at(-1)).toEqual({ id: 'math-2', label: 'Math' });
  });
});
