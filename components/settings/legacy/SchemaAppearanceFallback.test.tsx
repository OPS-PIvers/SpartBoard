import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaAppearanceFallback } from './SchemaAppearanceFallback';
import { WIDGET_SETTINGS_SCHEMAS } from '@/components/widgets/WidgetRegistry';
import {
  useDashboardActions,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import { STANDARD_COLORS } from '@/config/colors';
import type { ClockConfig, WidgetData } from '@/types';

vi.mock('@/context/dashboardCanvasStore');

const mockUpdateWidget = vi.fn();

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    isAdmin: false,
    canAccessFeature: () => true,
  }),
}));

const config: ClockConfig = {
  format24: true,
  showSeconds: true,
  themeColor: STANDARD_COLORS.slate,
  fontFamily: 'global',
  clockStyle: 'modern',
  glow: false,
  dateColor: undefined,
};

const widget: WidgetData = {
  id: 'w1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 280,
  h: 140,
  z: 1,
  config,
} as WidgetData;

describe('SchemaAppearanceFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: mockUpdateWidget,
    } as unknown as DashboardActions);
  });

  it('renders the display group above the schema styleKeys fields for a migrated widget', async () => {
    const { container } = render(<SchemaAppearanceFallback widget={widget} />);
    await waitFor(() =>
      expect(
        screen.getByRole('radiogroup', { name: 'Font' })
      ).toBeInTheDocument()
    );
    const display = screen.getByRole('radiogroup', { name: 'Display Style' });
    const font = screen.getByRole('radiogroup', { name: 'Font' });
    expect(
      display.compareDocumentPosition(font) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(container.querySelector('[data-group="display"]')).not.toBeNull();
  });

  it('calls updateWidget with the merged config when a style field changes', async () => {
    render(<SchemaAppearanceFallback widget={widget} />);
    const serif = await waitFor(() =>
      screen.getByRole('radio', { name: /^Serif$/i })
    );
    fireEvent.click(serif);
    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      config: { ...config, fontFamily: 'font-serif' },
    });
  });

  it('renders nothing for a widget type with no registered schema', () => {
    const { container } = render(
      <SchemaAppearanceFallback
        widget={{ ...widget, type: 'nonexistent' } as unknown as WidgetData}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the schema chunk fails to load', async () => {
    const originalLoader = WIDGET_SETTINGS_SCHEMAS.clock;
    WIDGET_SETTINGS_SCHEMAS.clock = () =>
      Promise.reject(new Error('chunk load failed'));
    try {
      const { container } = render(
        <SchemaAppearanceFallback widget={widget} />
      );
      await waitFor(() => expect(container.firstChild).toBeNull());
    } finally {
      WIDGET_SETTINGS_SCHEMAS.clock = originalLoader;
    }
  });

  it('keeps the window font and text size when the schema declares no style content', async () => {
    // Rendering null here reads upstream as "this widget has a custom
    // appearance panel", which drops UniversalStyleSettings entirely.
    const originalLoader = WIDGET_SETTINGS_SCHEMAS.clock;
    WIDGET_SETTINGS_SCHEMAS.clock = () => Promise.resolve({ groups: [] });
    try {
      render(<SchemaAppearanceFallback widget={widget} />);
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Handwritten' })
        ).toBeInTheDocument()
      );
      expect(
        screen.getByRole('combobox', { name: 'Select default text size' })
      ).toBeInTheDocument();
    } finally {
      WIDGET_SETTINGS_SCHEMAS.clock = originalLoader;
    }
  });
});
