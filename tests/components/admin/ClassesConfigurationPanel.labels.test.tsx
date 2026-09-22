// Pins the "Enable ClassLink Sync" Toggle's accessible name; without a label prop the switch is unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ClassesGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { ClassesConfigurationPanel } from '@/components/admin/ClassesConfigurationPanel';

afterEach(cleanup);

describe('ClassesConfigurationPanel — label associations', () => {
  it('names the Enable ClassLink Sync toggle', () => {
    render(
      <ClassesConfigurationPanel
        config={{} as ClassesGlobalConfig}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('switch', { name: 'Enable ClassLink Sync' })
    ).toBeInTheDocument();
  });
});
