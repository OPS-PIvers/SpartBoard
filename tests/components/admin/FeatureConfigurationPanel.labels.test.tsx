// Pins the "Show Feels Like Temperature" Toggle's accessible name; without a label prop the switch is unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { FeaturePermission, ToolMetadata } from '@/types';
import { Sun } from 'lucide-react';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { FeatureConfigurationPanel } from '@/components/admin/FeatureConfigurationPanel';

afterEach(cleanup);

const tool: ToolMetadata = {
  type: 'weather',
  icon: Sun,
  label: 'Weather',
  color: '#000',
};

const permission: FeaturePermission = {
  widgetType: 'weather',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: {
    fetchingStrategy: 'admin_proxy',
    updateFrequencyMinutes: 15,
    temperatureRanges: [],
  },
};

describe('FeatureConfigurationPanel — label associations', () => {
  it('names the Show Feels Like Temperature toggle', () => {
    render(
      <FeatureConfigurationPanel
        tool={tool}
        permission={permission}
        updatePermission={vi.fn()}
        showMessage={vi.fn()}
        uploadWeatherImage={vi.fn()}
      />
    );

    expect(
      screen.getByRole('switch', { name: 'Show Feels Like Temperature' })
    ).toBeInTheDocument();
  });
});
