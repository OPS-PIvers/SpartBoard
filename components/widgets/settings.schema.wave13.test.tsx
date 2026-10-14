import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import {
  useDashboardActions,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import type { GlobalStyle, WidgetData, WidgetType } from '@/types';
import noSettingsSchema from '@/components/settings/schema/noSettingsSchema';
import catalystSchema from './Catalyst/settings.schema';
import miniAppSchema from './MiniApp/settings.schema';
import smartNotebookSchema from './SmartNotebook/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';

vi.mock('@/context/dashboardCanvasStore');
vi.mock('@/hooks/useHelpResources', () => ({
  useHelpItemsForWidget: () => [],
}));
vi.mock('@/components/common/WidgetBuildingToggle', () => ({
  WidgetBuildingToggle: () => null,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    isAdmin: false,
    canAccessFeature: () => true,
    canAccessWidget: () => true,
    profileLoaded: true,
  }),
}));

const migratedSchemas = {
  catalyst: catalystSchema,
  'catalyst-instruction': noSettingsSchema,
  'catalyst-visual': noSettingsSchema,
  smartNotebook: smartNotebookSchema,
  miniApp: miniAppSchema,
  traffic: noSettingsSchema,
  classes: noSettingsSchema,
} satisfies Partial<Record<WidgetType, WidgetSettingsSchema>>;

const widgetOf = (type: WidgetType, config: object = {}): WidgetData => ({
  id: `${type}-1`,
  type,
  x: 0,
  y: 0,
  w: 300,
  h: 300,
  z: 1,
  flipped: true,
  config,
});

const renderDrawer = (
  widget: WidgetData,
  tab: 'settings' | 'style' = 'settings'
) => {
  render(
    <SettingsDrawer
      widget={widget}
      title={widget.type}
      placement="right"
      width={400}
      onWidthCommit={vi.fn()}
      onClose={vi.fn()}
      updateWidget={vi.fn()}
      updateConfig={vi.fn()}
      globalStyle={{ fontFamily: 'sans' } as GlobalStyle}
      schema={migratedSchemas[widget.type as keyof typeof migratedSchemas]}
      canAccessFeature={() => true}
      canAccessWidget={() => true}
      profileLoaded
    />
  );
  if (tab === 'style') fireEvent.click(screen.getByRole('tab', { name: /style/i }));
};

describe('wave 13 settings-drawer widget migrations', () => {
  beforeEach(() => {
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: vi.fn(),
    } as unknown as DashboardActions);
  });

  it.each(Object.entries(migratedSchemas))(
    '%s has a valid, warning-free schema',
    (type, schema) => {
      expect(validateSchema(type as WidgetType, schema)).toEqual({
        errors: [],
        warnings: [],
      });
    }
  );

  it.each(Object.keys(migratedSchemas))(
    '%s is drawer-owned rather than legacy-panel-owned',
    async (type) => {
      const widgetType = type as WidgetType;
      const loader = WIDGET_SETTINGS_SCHEMAS[widgetType];
      expect(loader).toBeTypeOf('function');
      await expect(loader?.()).resolves.toBe(
        migratedSchemas[type as keyof typeof migratedSchemas]
      );
      expect(WIDGET_SETTINGS_COMPONENTS[widgetType]).toBeUndefined();
      expect(WIDGET_APPEARANCE_COMPONENTS[widgetType]).toBeUndefined();
    }
  );

  it('keeps custom fields limited to notices', () => {
    const customKeys = Object.fromEntries(
      Object.entries(migratedSchemas).map(([type, schema]) => [
        type,
        schema.groups.flatMap((group) =>
          (group.fields as ReadonlyArray<Field>)
            .filter((field) => field.type === 'custom')
            .map((field) => field.key)
        ),
      ])
    );

    expect(customKeys).toEqual({
      catalyst: ['managedNotice'],
      'catalyst-instruction': [],
      'catalyst-visual': [],
      smartNotebook: [],
      miniApp: ['manageNotice'],
      traffic: [],
      classes: [],
    });
  });

  it('keeps Smart Notebook font and surface controls on the Style tab', () => {
    expect(smartNotebookSchema.styleKeys).toEqual([
      'fontFamily',
      'fontColor',
      'cardColor',
    ]);
  });

  it('shows the admin-managed notice for Catalyst in the drawer', async () => {
    renderDrawer(widgetOf('catalyst'));
    expect(
      await screen.findByRole('note', { name: 'Admin managed' })
    ).toBeInTheDocument();
  });

  it('shows the Mini App hint in the drawer', async () => {
    renderDrawer(widgetOf('miniApp', { activeApp: null }));
    expect(
      await screen.findByText('Manage apps in the main view.')
    ).toBeInTheDocument();
  });

  it.each([
    'traffic',
    'classes',
    'catalyst-instruction',
    'catalyst-visual',
    'smartNotebook',
  ] as const)(
    '%s keeps the standard empty Settings tab in the drawer',
    async (type) => {
      renderDrawer(widgetOf(type));
      expect(
        await screen.findByText('Standard settings available.')
      ).toBeInTheDocument();
    }
  );

  it('renders Smart Notebook font, font color and surface on the drawer Style tab', () => {
    renderDrawer(
      widgetOf('smartNotebook', {
        activeNotebookId: null,
        cardColor: '#ffffff',
        cardOpacity: 1,
      }),
      'style'
    );
    expect(
      screen.getAllByRole('slider', { name: /opacity/i }).length
    ).toBeGreaterThan(0);
    expect(screen.getByText('Font')).toBeInTheDocument();
    expect(screen.getByText('Font color')).toBeInTheDocument();
  });
});
