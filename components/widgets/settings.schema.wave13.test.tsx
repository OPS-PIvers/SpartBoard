import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import { SchemaSettingsFallback } from '@/components/settings/legacy/SchemaSettingsFallback';
import { SchemaAppearanceFallback } from '@/components/settings/legacy/SchemaAppearanceFallback';
import {
  useDashboardActions,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import type { WidgetData, WidgetType } from '@/types';
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

const widgetOf = (type: WidgetType, config: object = {}): WidgetData =>
  ({
    id: `${type}-1`,
    type,
    x: 0,
    y: 0,
    w: 300,
    h: 300,
    z: 1,
    flipped: true,
    config,
  }) as WidgetData;

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

  it('shows the admin-managed notice for Catalyst on the legacy panel', async () => {
    render(<SchemaSettingsFallback widget={widgetOf('catalyst')} />);
    expect(
      await screen.findByText(
        'Catalyst routines and categories are managed for all classrooms by your district administrator.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Admin managed')).toBeInTheDocument();
  });

  it('shows the Mini App hint on the legacy panel', async () => {
    render(
      <SchemaSettingsFallback
        widget={widgetOf('miniApp', { activeApp: null })}
      />
    );
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
    '%s keeps the standard empty Settings tab on the legacy panel',
    async (type) => {
      render(<SchemaSettingsFallback widget={widgetOf(type)} />);
      expect(
        await screen.findByText('Standard settings available.')
      ).toBeInTheDocument();
    }
  );

  it('renders Smart Notebook font, font color and surface on the legacy Style tab', async () => {
    render(
      <SchemaAppearanceFallback
        widget={widgetOf('smartNotebook', {
          activeNotebookId: null,
          cardColor: '#ffffff',
          cardOpacity: 1,
        })}
      />
    );
    await waitFor(() =>
      expect(
        screen.getByRole('slider', { name: /opacity/i })
      ).toBeInTheDocument()
    );
    expect(screen.getByText('Font')).toBeInTheDocument();
    expect(screen.getByText('Font color')).toBeInTheDocument();
  });
});
