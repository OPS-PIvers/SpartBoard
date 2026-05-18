import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const noop = vi.fn();
const updateDashboardSettings = vi.fn();
const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { id: 'd1', settings: { quickAccessWidgets: [] } },
    updateDashboardSettings,
    addToast,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _k,
  }),
}));

import { QuickAccessModal } from '@/components/quickAccessModal/QuickAccessModal';

describe('QuickAccessModal', () => {
  beforeEach(() => updateDashboardSettings.mockClear());

  it('renders title and slot counter', () => {
    render(<QuickAccessModal isOpen={true} onClose={noop} />);
    expect(screen.getByText('Quick Access Widgets')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('search filters widget tiles', async () => {
    render(<QuickAccessModal isOpen={true} onClose={noop} />);
    const input = screen.getByPlaceholderText('Search widgets…');
    await userEvent.type(input, 'this-will-not-match-any-widget-label');
    expect(screen.getByText('No widgets match.')).toBeInTheDocument();
  });
});
