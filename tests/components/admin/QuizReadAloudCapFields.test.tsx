import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

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
    next({ data: () => ({ enabledLanguages: ['es'] }) });
    return () => undefined;
  },
  setDoc: () => Promise.resolve(),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com' } }),
}));
vi.mock('@/components/quiz/readAloud/ReadAloudPreviewButton', () => ({
  ReadAloudPreviewButton: () => null,
}));

import { QuizReadAloudConfigurationPanel } from '@/components/admin/QuizReadAloudConfigurationPanel';

describe('QuizReadAloudConfigurationPanel cap fields', () => {
  it('lets the admin clear a cap field without snapping it to 0', () => {
    render(<QuizReadAloudConfigurationPanel />);
    const inputs = screen
      .getAllByRole('spinbutton')
      .filter((i) => (i as HTMLInputElement).step === '100');
    expect(inputs.length).toBeGreaterThan(0);
    const input = inputs[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });
});
