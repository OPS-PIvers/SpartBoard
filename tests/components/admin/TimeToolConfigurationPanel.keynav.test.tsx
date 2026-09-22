// Parameterized over the 4 exclusive-choice radiogroups (Mode, Display Style,
// Number Style, Alert Sound): pins that ArrowRight moves roving tabIndex to
// the next option AND writes that option's value via onChange, for each
// group's own options array/config field/default. Catches a copy/paste slip
// (wrong options array or wrong config field wired to one group) that no
// existing test would notice, since each group is otherwise hand-wired.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  cleanup,
  within,
  fireEvent,
} from '@testing-library/react';
import type { TimeToolGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { TimeToolConfigurationPanel } from '@/components/admin/TimeToolConfigurationPanel';

afterEach(cleanup);

const GROUPS = [
  {
    name: 'Default Mode',
    configField: 'mode',
    // [defaultIndex, valueAfterArrowRight]
    defaultIndex: 0,
    nextValue: 'stopwatch',
  },
  {
    name: 'Display Style',
    configField: 'visualType',
    defaultIndex: 0,
    nextValue: 'visual',
  },
  {
    name: 'Number Style',
    configField: 'clockStyle',
    defaultIndex: 0,
    nextValue: 'lcd',
  },
  {
    name: 'Default Alert Sound',
    configField: 'selectedSound',
    // Default sound is 'Gong', the 3rd of ['Chime', 'Blip', 'Gong', 'Alert'].
    defaultIndex: 2,
    nextValue: 'Alert',
  },
  {
    name: 'Accent Color',
    configField: 'themeColor',
    // Nothing selected by default — roving tabindex falls back to swatch 0 (slate, #1e293b).
    defaultIndex: 0,
    nextValue: '#ef4444', // red, the 2nd WIDGET_PALETTE entry
  },
  {
    name: 'Timer-End Traffic Light Color',
    configField: 'timerEndTrafficColor',
    // Default is null, matching the 'None' option at index 0.
    defaultIndex: 0,
    nextValue: 'green',
  },
];

describe('TimeToolConfigurationPanel — radiogroup keyboard navigation', () => {
  it.each(GROUPS)(
    'moves focus and selection to the next option on ArrowRight in $name',
    ({ name, configField, defaultIndex, nextValue }) => {
      const handleChange = vi.fn();
      render(
        <TimeToolConfigurationPanel
          config={{} as TimeToolGlobalConfig}
          onChange={handleChange}
        />
      );

      const group = screen.getByRole('radiogroup', { name });
      const radios = within(group).getAllByRole('radio');
      const current = radios[defaultIndex];
      const next = radios[defaultIndex + 1];

      current.focus();
      expect(document.activeElement).toBe(current);

      fireEvent.keyDown(group, { key: 'ArrowRight' });

      expect(document.activeElement).toBe(next);
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          buildingDefaults: expect.objectContaining({
            b1: expect.objectContaining({ [configField]: nextValue }),
          }),
        })
      );
    }
  );
});
