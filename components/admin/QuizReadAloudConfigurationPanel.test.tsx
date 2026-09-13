// A translation-only edit must not rewrite admin_settings/quiz_read_aloud.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDocMock = vi.fn((_ref: { path: string }, _data: unknown) =>
  Promise.resolve()
);
const snapshotData: Record<string, Record<string, unknown>> = {
  quiz_read_aloud: {},
  quiz_translation: { enabledLanguages: ['es'] },
};

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({
    path: `${collection}/${id}`,
    id,
  }),
  onSnapshot: (
    ref: { id: string },
    next: (snap: { data: () => unknown }) => void
  ) => {
    next({ data: () => snapshotData[ref.id] });
    return () => undefined;
  },
  setDoc: (ref: { path: string }, data: unknown) => setDocMock(ref, data),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com' } }),
}));
vi.mock('@/components/quiz/readAloud/ReadAloudPreviewButton', () => ({
  ReadAloudPreviewButton: () => null,
}));

import { QuizReadAloudConfigurationPanel } from './QuizReadAloudConfigurationPanel';

describe('QuizReadAloudConfigurationPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes only the translation doc when only a language was toggled', async () => {
    render(<QuizReadAloudConfigurationPanel />);
    const toggles = screen.getAllByRole('checkbox');
    fireEvent.click(toggles[0]);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const paths = setDocMock.mock.calls.map((call) => call[0].path);
    expect(paths).toContain('admin_settings/quiz_translation');
    expect(paths).not.toContain('admin_settings/quiz_read_aloud');
  });
});
