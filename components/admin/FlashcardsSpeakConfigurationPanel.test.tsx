import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDocMock = vi.fn((_ref: { path: string }, _data: unknown) =>
  Promise.resolve()
);
let snapshotData: unknown = undefined;
const live = vi.hoisted(() => ({
  push: null as ((data: unknown) => void) | null,
}));

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
    live.push = (data) => next({ data: () => data });
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
    for (const language of ['Spanish', 'German', 'English']) {
      expect(
        screen.getByLabelText<HTMLSelectElement>(
          `Starting level for ${language}`
        ).value
      ).toBe('beginner');
    }
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('normalizes a malformed doc before showing it', () => {
    snapshotData = { attempts: 99, languages: { de: { preset: 'nope' } } };
    render(<FlashcardsSpeakConfigurationPanel />);
    expect(
      screen.getByLabelText<HTMLSelectElement>('Tries per card').value
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

  it("keeps another admin's newer save for fields this admin didn't touch", async () => {
    render(<FlashcardsSpeakConfigurationPanel />);
    fireEvent.change(screen.getByLabelText('Starting level for German'), {
      target: { value: 'intermediate' },
    });
    act(() => live.push?.({ attempts: 7 }));
    expect(
      screen.getByLabelText<HTMLSelectElement>('Tries per card').value
    ).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1));
    expect(setDocMock.mock.calls[0][1]).toMatchObject({
      attempts: 7,
      languages: { de: { preset: 'intermediate' } },
    });
  });
});
