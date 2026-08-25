// Pins the Default Theme Color group's aria-labelledby ↔ SettingsLabel id pairing; dropping the id leaves the group unnamed with nothing else failing.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ClockGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { ClockConfigurationPanel } from '@/components/admin/ClockConfigurationPanel';

afterEach(cleanup);

describe('ClockConfigurationPanel — label associations', () => {
  it('names the Default Theme Color group from its heading', () => {
    render(
      <ClockConfigurationPanel
        config={{} as ClockGlobalConfig}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('group', { name: 'Default Theme Color' })
    ).toBeInTheDocument();
  });
});
