// Regression test for the "Default Layout"/"Default Participant Identification"
// label association fix (WCAG 1.3.1) — pins the htmlFor/id pairing so it
// doesn't silently regress if the file is touched again.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'high', name: 'Test High School' }],
}));

import { ActivityWallConfigurationPanel } from '@/components/admin/ActivityWallConfigurationPanel';

describe('ActivityWallConfigurationPanel — building defaults labels', () => {
  it('associates the Default Layout label with its select', () => {
    render(<ActivityWallConfigurationPanel config={{}} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Default Layout')).toBeInTheDocument();
  });

  it('associates the Default Participant Identification label with its select', () => {
    render(<ActivityWallConfigurationPanel config={{}} onChange={vi.fn()} />);

    expect(
      screen.getByLabelText('Default Participant Identification')
    ).toBeInTheDocument();
  });
});
