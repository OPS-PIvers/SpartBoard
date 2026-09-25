// Pins the building-gated content block: displayMode must be computed inside
// the control (hideUrlField-aware), never left keyed on the raw stored mode.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';

vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: () => undefined,
}));

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));

type EmbedConfigResult = {
  config: {
    buildingId: string;
    hideUrlField: boolean;
    whitelistUrls: string[];
  };
  isLoading: boolean;
};
const mockUseEmbedConfig = vi.fn<() => EmbedConfigResult>();
vi.mock('./hooks/useEmbedConfig', () => ({
  useEmbedConfig: () => mockUseEmbedConfig(),
}));

import { EmbedContentControl } from './EmbedContentControl';

const CATALOG: Record<string, string> = {
  'widgetSettings.embed.modeLabel': 'Embed Type',
  'widgetSettings.embed.modeUrlOption': 'Website URL',
  'widgetSettings.embed.modeCodeOption': 'Custom Code',
  'widgetSettings.embed.urlLabel': 'Target URL',
  'widgetSettings.embed.htmlLabel': 'HTML / CSS / JS',
  'widgetSettings.embed.verifyButton': 'Verify',
  'widgetSettings.embed.openOriginal': 'Open Original',
};

const t = (key: string, options?: Record<string, unknown>): string => {
  if (key in CATALOG) return CATALOG[key];
  return typeof options?.defaultValue === 'string' ? options.defaultValue : key;
};

const widget: WidgetData = {
  id: 'w1',
  type: 'embed',
  x: 0,
  y: 0,
  w: 480,
  h: 350,
  z: 1,
  flipped: false,
  config: {},
} as WidgetData;

const baseProps = {
  widget,
  t,
  isAdmin: false,
  canAccessFeature: () => true,
  id: 'embed-content',
  labelId: 'embed-content-label',
} satisfies Partial<CustomRenderCtx>;

describe('EmbedContentControl building policy', () => {
  it('renders the HTML editor and no URL field when hideUrlField is true, even with a stored url-mode config', () => {
    mockUseEmbedConfig.mockReturnValue({
      config: { buildingId: 'b1', hideUrlField: true, whitelistUrls: [] },
      isLoading: false,
    });

    render(
      <EmbedContentControl
        {...baseProps}
        config={{ mode: 'url', url: 'https://example.com', html: '' }}
        updateConfig={vi.fn()}
      />
    );

    expect(screen.getByLabelText('HTML / CSS / JS')).toBeInTheDocument();
    expect(screen.queryByLabelText('Target URL')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('toggles between the url and html blocks when hideUrlField is false', () => {
    mockUseEmbedConfig.mockReturnValue({
      config: { buildingId: 'b1', hideUrlField: false, whitelistUrls: [] },
      isLoading: false,
    });
    const updateConfig = vi.fn();

    const { rerender } = render(
      <EmbedContentControl
        {...baseProps}
        config={{ mode: 'url', url: '', html: '' }}
        updateConfig={updateConfig}
      />
    );

    expect(screen.getByLabelText('Target URL')).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Embed Type' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Custom Code' }));
    expect(updateConfig).toHaveBeenCalledWith({ mode: 'code' });

    rerender(
      <EmbedContentControl
        {...baseProps}
        config={{ mode: 'code', url: '', html: '' }}
        updateConfig={updateConfig}
      />
    );

    expect(screen.getByLabelText('HTML / CSS / JS')).toBeInTheDocument();
    expect(screen.queryByLabelText('Target URL')).not.toBeInTheDocument();
  });
});
