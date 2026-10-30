import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { editMiniAppCode, generateMiniAppCode } from '@/utils/ai';
import type { MiniAppItem } from '@/types';
import { MiniAppEditorModal } from './MiniAppEditorModal';

vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  setDoc: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/utils/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/ai')>()),
  editMiniAppCode: vi.fn(),
  generateMiniAppCode: vi.fn(),
}));

const app: MiniAppItem = {
  id: 'app-1',
  title: 'Fractions',
  html: '<html><body>v1</body></html>',
  createdAt: 1,
};

const AI = ['gemini-functions', 'mini-app-ai'];

function setup(flags: string[], resultsOn = false) {
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'teacher-1' },
    canAccessFeature: (id: string) => flags.includes(id),
  } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useDashboard).mockReturnValue({
    addToast: vi.fn(),
    activeDashboard: null,
  } as unknown as ReturnType<typeof useDashboard>);
  render(
    <MiniAppEditorModal
      isOpen
      app={app}
      onClose={vi.fn()}
      onSave={vi.fn(() => Promise.resolve())}
      resultsOn={resultsOn}
    />
  );
}

const codeBox = () => {
  if (!screen.queryByPlaceholderText(/Paste your HTML/)) {
    fireEvent.click(screen.getByRole('tab', { name: /Code/ }));
  }
  return screen.getByPlaceholderText(/Paste your HTML/);
};

beforeEach(() => vi.clearAllMocks());

describe('MiniAppEditorModal editor gate', () => {
  it('opens on the live preview with a Code toggle without the flag', () => {
    setup(AI);
    const preview = screen.getByTitle(/preview$/);
    expect(preview.tagName).toBe('IFRAME');
    expect(preview.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(screen.queryByPlaceholderText(/Paste your HTML/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Code/ }));
    expect(codeBox()).toHaveClass('bg-white');
    expect(screen.queryByRole('button', { name: /Try as student/ })).toBeNull();
  });

  it('shows Try as student with the flag alone', () => {
    setup([...AI, 'mini-app-results']);
    expect(
      screen.getByRole('button', { name: /Try as student/ })
    ).toBeInTheDocument();
    expect(screen.queryByText(/answer key/i)).toBeNull();
  });
});

describe('MiniAppEditorModal Edit with AI', () => {
  it('revises the current code, keeps the title and can undo', async () => {
    vi.mocked(editMiniAppCode).mockResolvedValue({
      title: 'Something else',
      html: '<html><body>v2</body></html>',
    });
    setup(AI);
    fireEvent.click(screen.getByRole('button', { name: /Edit with AI/ }));
    fireEvent.change(screen.getByLabelText('Describe the change'), {
      target: { value: 'make it blue' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Apply changes/ }));

    await waitFor(() =>
      expect(codeBox()).toHaveValue(app.html.replace('v1', 'v2'))
    );
    expect(editMiniAppCode).toHaveBeenCalledWith(app.html, 'make it blue');
    expect(generateMiniAppCode).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Fractions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Undo AI change/ }));
    expect(codeBox()).toHaveValue(app.html);
    expect(screen.queryByRole('button', { name: /Undo AI change/ })).toBeNull();
  });

  it('can start over with a fresh draft', async () => {
    vi.mocked(generateMiniAppCode).mockResolvedValue({
      title: 'Spinner',
      html: '<html>new</html>',
    });
    setup(AI);
    fireEvent.click(screen.getByRole('button', { name: /Edit with AI/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Start over/ }));
    fireEvent.change(screen.getByLabelText('Describe your mini-app'), {
      target: { value: 'a spinner' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Draft app/ }));

    await waitFor(() => expect(codeBox()).toHaveValue('<html>new</html>'));
    expect(generateMiniAppCode).toHaveBeenCalledWith('a spinner', 'mini-app');
    expect(editMiniAppCode).not.toHaveBeenCalled();
  });
});
