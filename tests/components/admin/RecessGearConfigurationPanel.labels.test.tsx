// Pins the "Use Feels Like" Toggle's accessible name; without a label prop the switch is unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { RecessGearConfigurationPanel } from '@/components/admin/RecessGearConfigurationPanel';

afterEach(cleanup);

describe('RecessGearConfigurationPanel — label associations', () => {
  it('names the Use Feels Like toggle', () => {
    render(<RecessGearConfigurationPanel config={{}} onChange={vi.fn()} />);

    expect(
      screen.getByRole('switch', { name: 'Use Feels Like' })
    ).toBeInTheDocument();
  });
});
