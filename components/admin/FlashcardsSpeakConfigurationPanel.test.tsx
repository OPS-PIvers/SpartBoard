import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDocMock = vi.fn((_ref: { path: string }, _data: unknown) =>
  Promise.resolve()
);
let snapshotData: unknown = undefined;

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({
    path: `${collection}/${id}`,
    id,
  }),
  onSnapshot: (
    _ref: unknown,
    next: (snap: { data: () => unknown }) => void
  ) => {
    next({ data: () => snapshotData });
    return () => undefined;
  },
  setDoc: (ref: { path: string }, data: unknown) => setDocMock(ref, data),
}));

import { FlashcardsSpeakConfigurationPanel } from './FlashcardsSpeakConfigurationPanel';

describe('FlashcardsSpeakConfigurationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotData = undefined;
  });

  it('starts every language at Beginner with Save disabled when no doc exists', () => {
    render(<FlashcardsSpeakConfigurationPanel />);
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(3);
    for (const select of selects) {
      expect((select as HTMLSelectElement).value).toBe('beginner');
    }
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('normalizes a malformed doc before showing it', () => {
    snapshotData = { attempts: 99, languages: { de: { preset: 'nope' } } };
    render(<FlashcardsSpeakConfigurationPanel />);
    expect(
      screen.getByLabelText<HTMLInputElement>('Tries per card').value
    ).toBe('10');
    expect(
      screen.getByLabelText<HTMLSelectElement>('Starting level for German')
        .value
    ).toBe('beginner');
  });

  it('saves the edited level and keeps saved sound overrides', async () => {
    snapshotData = {
      languages: {
        es: { preset: 'beginner', groups: { 'es-trill': 'require' } },
      },
    };
    render(<FlashcardsSpeakConfigurationPanel />);
    fireEvent.change(screen.getByLabelText('Starting level for Spanish'), {
      target: { value: 'advanced' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1));
    const [ref, data] = setDocMock.mock.calls[0];
    expect(ref.path).toBe('admin_settings/flashcardsSpeak');
    expect(data).toMatchObject({
      attempts: 3,
      languages: {
        es: { preset: 'advanced', groups: { 'es-trill': 'require' } },
        de: { preset: 'beginner' },
      },
    });
  });
});
