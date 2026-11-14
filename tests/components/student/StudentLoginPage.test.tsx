import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('firebase/auth', () => ({ signInWithCustomToken: vi.fn() }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn()),
  FunctionsError: class FunctionsError extends Error {},
}));
vi.mock('@/config/firebase', () => ({ auth: {}, functions: {} }));

const idApi = {
  initialize: vi.fn(),
  prompt: vi.fn(),
  renderButton: vi.fn(),
  cancel: vi.fn(),
  disableAutoSelect: vi.fn(),
};

const renderPage = async () => {
  const { StudentLoginPage } =
    await import('@/components/student/StudentLoginPage');
  return render(<StudentLoginPage />);
};

const IDLE_TEXT = 'You were signed out after 15 minutes without activity.';

describe('StudentLoginPage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client');
    (window as unknown as { google: unknown }).google = {
      accounts: { id: idApi },
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState({}, '', '/');
  });

  it('auto-selects and prompts on a plain load', async () => {
    window.history.replaceState({}, '', '/student/login');
    await renderPage();
    expect(idApi.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ auto_select: true })
    );
    expect(idApi.prompt).toHaveBeenCalledTimes(1);
    expect(idApi.disableAutoSelect).not.toHaveBeenCalled();
  });

  it('turns off auto-select after Sign out', async () => {
    window.history.replaceState({}, '', '/student/login?reason=signed-out');
    await renderPage();
    expect(idApi.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ auto_select: false })
    );
    expect(idApi.disableAutoSelect).toHaveBeenCalled();
    expect(idApi.prompt).not.toHaveBeenCalled();
    expect(screen.queryByText(IDLE_TEXT)).toBeNull();
  });

  it('turns off auto-select and explains after an idle sign-out', async () => {
    window.history.replaceState({}, '', '/student/login?reason=idle');
    await renderPage();
    expect(idApi.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ auto_select: false })
    );
    expect(idApi.disableAutoSelect).toHaveBeenCalled();
    expect(idApi.prompt).not.toHaveBeenCalled();
    expect(screen.getByText(IDLE_TEXT)).toBeTruthy();
  });

  it('Try again sets up sign-in after a no-classes bounce', async () => {
    window.history.replaceState({}, '', '/student/login?reason=no-classes');
    await renderPage();
    expect(idApi.initialize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(idApi.initialize).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Loading sign-in/)).toBeNull();
  });

  it('ignores an unknown reason', async () => {
    window.history.replaceState({}, '', '/student/login?reason=<script>');
    await renderPage();
    expect(idApi.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ auto_select: true })
    );
    expect(idApi.prompt).toHaveBeenCalledTimes(1);
    expect(idApi.disableAutoSelect).not.toHaveBeenCalled();
  });
});
