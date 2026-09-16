import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveWidgetDefault = vi.fn();
const auth = {
  savedWidgetConfigs: {} as Record<string, Record<string, unknown>>,
  saveWidgetDefault,
  featurePermissions: [],
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => auth,
}));

import { WidgetDefaultsSection } from '@/components/settingsModal/sections/WidgetDefaultsSection';

describe('WidgetDefaultsSection', () => {
  beforeEach(() => {
    saveWidgetDefault.mockClear();
    auth.savedWidgetConfigs = {};
  });

  it('explains how to create a default when there are none', () => {
    auth.savedWidgetConfigs = { text: {} };
    render(<WidgetDefaultsSection />);
    expect(screen.getByText(/No widget defaults yet/)).toBeInTheDocument();
  });

  it('lists each saved setting with readable values', () => {
    auth.savedWidgetConfigs = {
      text: {
        fontFamily: 'font-serif',
        bgColor: '#dcfce7',
        textSizePreset: 'large',
      },
    };
    render(<WidgetDefaultsSection />);
    const row = within(screen.getByTestId('widget-default-text'));
    expect(row.getByText('Note color')).toBeInTheDocument();
    expect(row.getByText('Green')).toBeInTheDocument();
    expect(row.getByText('Serif')).toBeInTheDocument();
    expect(row.getByText('Large')).toBeInTheDocument();
  });

  it('removes one setting and keeps the rest', () => {
    auth.savedWidgetConfigs = {
      text: { fontColor: '#ffffff', bgColor: '#dcfce7' },
    };
    render(<WidgetDefaultsSection />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Note color from Note' })
    );
    expect(saveWidgetDefault).toHaveBeenCalledWith('text', {
      fontColor: '#ffffff',
    });
  });

  it('clears a whole widget default', () => {
    auth.savedWidgetConfigs = { text: { fontColor: '#ffffff' } };
    render(<WidgetDefaultsSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear Note default' }));
    expect(saveWidgetDefault).toHaveBeenCalledWith('text', {});
  });

  it('ignores stored keys outside the appearance allowlist', () => {
    auth.savedWidgetConfigs = { checklist: { items: ['secret'] } };
    render(<WidgetDefaultsSection />);
    expect(screen.queryByTestId('widget-default-checklist')).toBeNull();
    expect(screen.getByText(/No widget defaults yet/)).toBeInTheDocument();
  });
});
