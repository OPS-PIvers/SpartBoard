import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import type { GlobalStyle, WidgetData } from '@/types';
import schema from './settings.schema';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ selectedBuildings: ['schumann-elementary'] }),
}));

vi.mock('@/hooks/useFeaturePermissions', () => ({
  useFeaturePermissions: () => ({
    subscribeToPermission: () => () => undefined,
    loading: false,
  }),
}));

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

beforeEach(() => {
  mockUseEmbedConfig.mockReturnValue({
    config: {
      buildingId: 'schumann-elementary',
      hideUrlField: false,
      whitelistUrls: [],
    },
    isLoading: false,
  });
});

// jsdom has no layout, so axe's color-contrast rule can only report "incomplete".
const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

const widget = {
  id: 'w1',
  type: 'embed',
  x: 0,
  y: 0,
  w: 480,
  h: 350,
  z: 1,
  config: {
    mode: 'url',
    url: 'https://example.com',
    isEmbeddable: true,
    blockedReason: '',
    html: '',
    refreshInterval: 0,
  },
} as WidgetData;

describe('Embed settings drawer accessibility', () => {
  it('has no structural axe violations', async () => {
    const { baseElement } = render(
      <SettingsDrawer
        widget={widget}
        title="Embed"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={schema}
      />
    );
    expect(await axe(baseElement, STRUCTURAL_ONLY)).toHaveNoViolations();
  });

  it('gives every field control an accessible name', () => {
    const { getByRole, getByLabelText } = render(
      <SettingsDrawer
        widget={widget}
        title="Embed"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={schema}
      />
    );

    expect(getByLabelText('Target URL')).toBeInTheDocument();
    expect(getByRole('radiogroup', { name: 'Embed Type' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Verify' })).toBeInTheDocument();
    expect(getByLabelText('Auto-Refresh')).toBeInTheDocument();
  });

  it('renders the code editor and hides the URL field in code mode', () => {
    const codeWidget = {
      ...widget,
      config: { ...widget.config, mode: 'code', html: '<h1>hi</h1>' },
    } as WidgetData;
    const { getByLabelText, queryByLabelText } = render(
      <SettingsDrawer
        widget={codeWidget}
        title="Embed"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={schema}
      />
    );

    expect(getByLabelText('HTML / CSS / JS')).toBeInTheDocument();
    expect(queryByLabelText('Target URL')).not.toBeInTheDocument();
  });

  it('forces the HTML editor when the building hides the URL field, even with a stored url-mode config', () => {
    mockUseEmbedConfig.mockReturnValue({
      config: {
        buildingId: 'schumann-elementary',
        hideUrlField: true,
        whitelistUrls: [],
      },
      isLoading: false,
    });
    // widget.config.mode is 'url' — the raw stored mode the building policy overrides.
    const { getByLabelText, queryByLabelText, queryByRole } = render(
      <SettingsDrawer
        widget={widget}
        title="Embed"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={schema}
      />
    );

    expect(getByLabelText('HTML / CSS / JS')).toBeInTheDocument();
    expect(queryByLabelText('Target URL')).not.toBeInTheDocument();
    expect(queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});
