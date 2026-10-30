import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SEND_BLOCK_PATTERNS } from '@/utils/import/sendBlockList';
import type { ReaderFailure } from './useImportBlockList';

const setDocMock = vi.fn<(...args: unknown[]) => Promise<void>>();
let patterns: readonly string[] = [];
let usingDefaults = true;
let failures: ReaderFailure[] = [];

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'boss@orono.k12.mn.us' } }),
}));
vi.mock('./useImportBlockList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useImportBlockList')>()),
  useImportBlockList: () => ({ patterns, usingDefaults, loading: false }),
  useReaderFailures: () => ({ failures, loading: false, error: false }),
}));

import { ImportBlockListPanel } from './ImportBlockListPanel';
import { readBlockListDoc } from './useImportBlockList';

const savedPatterns = () =>
  (setDocMock.mock.calls.at(-1)?.[1] as { patterns: string[] }).patterns;

beforeEach(() => {
  setDocMock.mockReset().mockResolvedValue(undefined);
  patterns = DEFAULT_SEND_BLOCK_PATTERNS;
  usingDefaults = true;
  failures = [];
});

describe('ImportBlockListPanel', () => {
  it('adds a normalized pattern to the saved list', () => {
    render(<ImportBlockListPanel />);
    fireEvent.change(screen.getByLabelText('New blocked address'), {
      target: { value: 'https://SIS.Example.org/Grades*' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(setDocMock).toHaveBeenCalledWith(
      'admin_settings/import_send_block_list',
      expect.objectContaining({ updatedBy: 'boss@orono.k12.mn.us' })
    );
    expect(savedPatterns()).toEqual([
      ...DEFAULT_SEND_BLOCK_PATTERNS,
      'sis.example.org/grades*',
    ]);
  });

  it('refuses an invalid or duplicate pattern', () => {
    render(<ImportBlockListPanel />);
    const input = screen.getByLabelText('New blocked address');
    fireEvent.change(input, { target: { value: 'not a site' } });
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
    fireEvent.change(input, { target: { value: '*.infinitecampus.org' } });
    expect(
      screen.getByText('That address is already on the list.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('removes a pattern', () => {
    render(<ImportBlockListPanel />);
    fireEvent.click(screen.getByLabelText('Remove *.infinitecampus.org'));
    expect(savedPatterns()).not.toContain('*.infinitecampus.org');
  });

  it('tests an address against the list', () => {
    render(<ImportBlockListPanel />);
    const input = screen.getByLabelText('Test an address');
    fireEvent.change(input, {
      target: { value: 'orono.infinitecampus.org/campus/home' },
    });
    expect(screen.getByRole('status').textContent).toBe('Blocked');
    fireEvent.change(input, {
      target: { value: 'en.wikipedia.org/wiki/Cell' },
    });
    expect(screen.getByRole('status').textContent).toBe('Not blocked');
  });

  it('offers Restore defaults only after the district saved its own list', () => {
    const { rerender } = render(<ImportBlockListPanel />);
    expect(screen.queryByText('Restore defaults')).toBeNull();
    usingDefaults = false;
    patterns = [];
    rerender(<ImportBlockListPanel />);
    fireEvent.click(screen.getByText('Restore defaults'));
    expect(savedPatterns()).toEqual([...DEFAULT_SEND_BLOCK_PATTERNS]);
  });

  it('lists reader problems and never links a non-web URL', () => {
    failures = [
      {
        id: 'f1',
        platform: 'schoology',
        reason: 'No questions found',
        url: 'https://app.schoology.com/assignment/1',
        createdAtMs: 1_700_000_000_000,
      },
      {
        id: 'f2',
        platform: 'quizlet',
        reason: 'Card list missing',
        url: 'javascript:alert(1)',
        createdAtMs: null,
      },
    ];
    render(<ImportBlockListPanel />);
    expect(screen.getByText('No questions found')).toBeTruthy();
    expect(screen.getByText('Schoology')).toBeTruthy();
    expect(screen.getByText('Quizlet')).toBeTruthy();
    expect(
      screen.getByText('https://app.schoology.com/assignment/1').closest('a')
    ).not.toBeNull();
    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull();
  });
});

describe('readBlockListDoc', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(readBlockListDoc(undefined)).toEqual({
      patterns: [...DEFAULT_SEND_BLOCK_PATTERNS],
      usingDefaults: true,
    });
  });

  it('keeps an empty saved list empty', () => {
    expect(readBlockListDoc({ patterns: [] })).toEqual({
      patterns: [],
      usingDefaults: false,
    });
  });
});
