// Pins each radiogroup's aria-labelledby ↔ SettingsLabel id pairing; dropping an id leaves the group unnamed with nothing else failing.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { TimeToolGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { TimeToolConfigurationPanel } from '@/components/admin/TimeToolConfigurationPanel';

afterEach(cleanup);

const RADIOGROUP_NAMES = [
  'Default Mode',
  'Display Style',
  'Number Style',
  'Default Alert Sound',
];

describe('TimeToolConfigurationPanel — radiogroup accessible names', () => {
  it.each(RADIOGROUP_NAMES)(
    'names the %s radiogroup from its visible heading',
    (name) => {
      render(
        <TimeToolConfigurationPanel
          config={{} as TimeToolGlobalConfig}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByRole('radiogroup', { name })).toBeInTheDocument();
    }
  );
});
