// Pins the "Allow Website URL Mode" Toggle's accessible name; without a label prop the switch is unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { EmbedGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { EmbedConfigurationPanel } from '@/components/admin/EmbedConfigurationPanel';

afterEach(cleanup);

describe('EmbedConfigurationPanel — label associations', () => {
  it('names the Allow Website URL Mode toggle', () => {
    render(
      <EmbedConfigurationPanel
        config={{} as EmbedGlobalConfig}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('switch', { name: 'Allow Website URL Mode' })
    ).toBeInTheDocument();
  });
});
