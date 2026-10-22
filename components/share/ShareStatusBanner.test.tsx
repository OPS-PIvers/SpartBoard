import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Z_INDEX } from '@/config/zIndex';
import { ShareStatusBanner } from './ShareStatusBanner';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: {
      id: 'board-1',
      linkedShareId: 'share-1',
      linkedShareRole: 'owner',
      linkedShareEnded: false,
    },
    stopSharingDashboard: vi.fn(),
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));

describe('ShareStatusBanner', () => {
  it('stacks under full-page views so it cannot cover their close button', () => {
    render(<ShareStatusBanner />);
    const chip = screen.getByRole('button', { name: /Sharing live/ });
    const container = chip.parentElement as HTMLElement;
    expect(Number(container.style.zIndex)).toBeLessThan(Z_INDEX.modal);
  });
});
