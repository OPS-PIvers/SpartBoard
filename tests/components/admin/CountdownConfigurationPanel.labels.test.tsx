// Pins the "Include weekends" and "Count today" Toggles' accessible names; without a label prop the switches are unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { CountdownGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { CountdownConfigurationPanel } from '@/components/admin/CountdownConfigurationPanel';

afterEach(cleanup);

describe('CountdownConfigurationPanel — label associations', () => {
  it('names the Include weekends and Count today toggles', () => {
    render(
      <CountdownConfigurationPanel
        config={{} as CountdownGlobalConfig}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('switch', { name: 'Include weekends' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Count today' })
    ).toBeInTheDocument();
  });
});
