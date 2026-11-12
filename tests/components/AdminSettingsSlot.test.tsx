import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const renderMode = vi.hoisted(() => ({ throwOnRender: false }));

vi.mock('@/components/admin/AdminSettings', () => ({
  AdminSettings: () => {
    if (renderMode.throwOnRender) throw new Error('boom');
    return <div>admin panel</div>;
  },
}));

import { AdminSettingsSlot } from '@/components/layout/sidebar/AdminSettingsSlot';

describe('AdminSettingsSlot', () => {
  beforeEach(() => {
    renderMode.throwOnRender = false;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a loading state while the panel downloads, then the panel', async () => {
    render(<AdminSettingsSlot onClose={() => undefined} />);
    expect(
      screen.getByRole('status', { name: 'Loading Admin Settings' })
    ).toBeInTheDocument();
    expect(await screen.findByText('admin panel')).toBeInTheDocument();
  });

  it('shows a visible message with Close when the panel fails, instead of nothing', async () => {
    renderMode.throwOnRender = true;
    const onClose = vi.fn();
    render(<AdminSettingsSlot onClose={onClose} />);
    expect(
      await screen.findByText("Admin Settings didn't load.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
