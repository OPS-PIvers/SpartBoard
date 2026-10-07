import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdateNotification } from './UpdateNotification';

vi.mock('@/hooks/useAppVersion', () => ({
  useAppVersion: () => ({ updateAvailable: true, reloadApp: vi.fn() }),
}));
vi.mock('./WhatsNewModal', () => ({ WhatsNewModal: () => null }));

const g = globalThis as Record<string, unknown>;

describe('UpdateNotification dismissal', () => {
  beforeEach(() => {
    sessionStorage.clear();
    g.__APP_VERSION__ = '1.0.0';
    g.__APP_BUILD_ID__ = 'build-A';
  });
  afterEach(() => {
    delete g.__APP_VERSION__;
    delete g.__APP_BUILD_ID__;
  });

  it('stays dismissed within the same build', () => {
    const { unmount } = render(<UpdateNotification />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    unmount();
    render(<UpdateNotification />);
    expect(screen.queryByText('Update Available')).toBeNull();
  });

  it('shows again after a reload onto a newer build', () => {
    const { unmount } = render(<UpdateNotification />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    unmount();
    g.__APP_BUILD_ID__ = 'build-B';
    render(<UpdateNotification />);
    expect(screen.getByText('Update Available')).toBeTruthy();
  });
});
