import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Z_INDEX } from '@/config/zIndex';
import { ShareStatusBanner } from './ShareStatusBanner';

let widgets: { id: string; maximized?: boolean }[] = [];

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: {
      id: 'board-1',
      widgets,
      linkedShareId: 'share-1',
      linkedShareRole: 'owner',
      linkedShareEnded: false,
    },
    stopSharingDashboard: vi.fn(),
  }),
}));

const chipLayer = () =>
  Number(
    (
      screen.getByRole('button', { name: /Sharing live/ })
        .parentElement as HTMLElement
    ).style.zIndex
  );

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));

describe('ShareStatusBanner', () => {
  afterEach(cleanup);

  it('stacks under full-page views so it cannot cover their close button', () => {
    widgets = [{ id: 'w1' }];
    render(<ShareStatusBanner />);
    expect(chipLayer()).toBeLessThan(Z_INDEX.modal);
  });

  it('stays above a maximized widget so Stop sharing is reachable', () => {
    widgets = [{ id: 'w1', maximized: true }];
    render(<ShareStatusBanner />);
    expect(chipLayer()).toBeGreaterThan(Z_INDEX.maximized);
  });
});
