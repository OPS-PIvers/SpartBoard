/**
 * SettingsModal — the teacher-facing Settings surface with its own rail.
 * Verifies the rail renders every section, switching the rail swaps the detail
 * pane (no bouncing back to the sidebar), the sections surface their controls,
 * and Escape closes.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setGlobalStyle = vi.fn();
const updateAccountPreferences = vi.fn();
const setLanguage = vi.fn();
const addToast = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    // globalStyle undefined → the editor falls back to DEFAULT_GLOBAL_STYLE.
    activeDashboard: { id: 'd1', globalStyle: undefined },
    setGlobalStyle,
    isActiveBoardReadOnly: false,
    addToast,
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    dockPosition: 'bottom',
    updateAccountPreferences,
    disableCloseConfirmation: false,
    remoteControlEnabled: false,
    setLanguage,
    language: 'en',
  }),
}));

vi.mock('@/i18n', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'en', label: 'English', nativeLabel: 'English' },
    { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  ],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _k,
  }),
}));

import { SettingsModal } from '@/components/settingsModal/SettingsModal';

describe('SettingsModal', () => {
  beforeEach(() => {
    setGlobalStyle.mockClear();
    updateAccountPreferences.mockClear();
    setLanguage.mockClear();
  });

  it('renders a rail tab for every section', () => {
    render(<SettingsModal onClose={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dock' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Behavior' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Language' })).toBeInTheDocument();
  });

  it('defaults to the Appearance section', () => {
    render(<SettingsModal onClose={vi.fn()} />);
    expect(screen.getByText('Typography')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Appearance' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('switches the detail pane when a rail tab is clicked', async () => {
    render(<SettingsModal onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Dock' }));
    // "Position" + "Dock Text" are unique to the Dock section.
    expect(screen.getByText('Dock Text')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Behavior' }));
    expect(screen.getByText('Disable Close Warning')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Language' }));
    expect(screen.getByText('Español')).toBeInTheDocument();
  });

  it('forwards a dock-position change to account preferences', async () => {
    render(<SettingsModal onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Dock' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Left' }));
    expect(updateAccountPreferences).toHaveBeenCalledWith({
      dockPosition: 'left',
    });
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SettingsModal onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
