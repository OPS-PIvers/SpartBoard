// Pins that a site change resets lastSyncDate too, or useNutrislice never re-fetches the new site.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { SchoolSiteControl } from './SchoolSiteControl';

const t = ((key: string, options?: Record<string, unknown>): string =>
  typeof options?.defaultValue === 'string'
    ? options.defaultValue
    : key) as CustomRenderCtx['t'];

const widget: WidgetData = {
  id: 'w1',
  type: 'lunchCount',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: false,
  config: {},
};

const baseProps = {
  widget,
  t,
  isAdmin: false,
  canAccessFeature: () => true,
  id: 'lunch-site',
  labelId: 'lunch-site-label',
} satisfies Partial<CustomRenderCtx>;

describe('SchoolSiteControl', () => {
  it('clears lastSyncDate (not just cachedMenu) when the site changes, so the new site refetches today', () => {
    const updateConfig = vi.fn();
    render(
      <SchoolSiteControl
        {...baseProps}
        config={{
          schoolSite: 'schumann-elementary',
          gradeLevel: 'K',
          lastSyncDate: new Date().toISOString(),
          cachedMenu: {
            hotLunch: { name: 'Pizza' },
            hotLunchSides: [],
            bentoBox: { name: 'Turkey Wrap' },
            date: new Date().toISOString(),
          },
        }}
        updateConfig={updateConfig}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'orono-high-school' },
    });

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolSite: 'orono-high-school',
        cachedMenu: null,
        lastSyncDate: null,
      })
    );
  });
});
