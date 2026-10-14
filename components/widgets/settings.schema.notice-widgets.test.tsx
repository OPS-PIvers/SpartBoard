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
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import type { GlobalStyle, WidgetData, WidgetType } from '@/types';
import activityWallSchema from './ActivityWall/settings.schema';
import projectsSchema from './Projects/settings.schema';
import stickersSchema from './stickers/settings.schema';
import talkingToolSchema from './TalkingTool/settings.schema';
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
vi.mock('@/hooks/useProjectsWidgetSettings');
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    isAdmin: false,
    canAccessFeature: () => true,
    canAccessWidget: () => true,
    profileLoaded: true,
  }),
}));

const updateWidget = vi.fn();

const migratedSchemas = {
  projects: projectsSchema,
  'activity-wall': activityWallSchema,
  'talking-tool': talkingToolSchema,
  stickers: stickersSchema,
} satisfies Partial<Record<WidgetType, WidgetSettingsSchema>>;

const makeWidget = (
  type: WidgetType,
  config: Record<string, unknown> = {}
): WidgetData => ({
  id: `${type}-1`,
  type,
  x: 0,
  y: 0,
  w: 500,
  h: 400,
  z: 1,
  flipped: true,
  config,
});

const renderDrawer = (
  widget: WidgetData,
  tab: 'settings' | 'style' = 'settings'
) => {
  const view = render(
    <SettingsDrawer
      widget={widget}
      title={widget.type}
      placement="right"
      width={400}
      onWidthCommit={vi.fn()}
      onClose={vi.fn()}
      updateWidget={updateWidget}
      updateConfig={(patch) => {
        updateWidget(widget.id, { config: { ...widget.config, ...patch } });
      }}
      globalStyle={{ fontFamily: 'sans' } as GlobalStyle}
      schema={migratedSchemas[widget.type as keyof typeof migratedSchemas]}
      canAccessFeature={() => true}
      canAccessWidget={() => true}
      profileLoaded
    />
  );
  if (tab === 'style')
    fireEvent.click(screen.getByRole('tab', { name: /style/i }));
  return view;
};

describe('notice-widget settings-drawer migrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget,
    } as unknown as DashboardActions);
    vi.mocked(useProjectsWidgetSettings).mockReturnValue({ enabled: true });
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
    (type) => {
      const widgetType = type as WidgetType;
      expect(WIDGET_SETTINGS_SCHEMAS[widgetType]).toBeTypeOf('function');
      expect(WIDGET_SETTINGS_COMPONENTS[widgetType]).toBeUndefined();
      expect(WIDGET_APPEARANCE_COMPONENTS[widgetType]).toBeUndefined();
    }
  );

  it('keeps custom fields limited to notices and the library link', () => {
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
      projects: ['view'],
      'activity-wall': ['managedNotice'],
      'talking-tool': ['managedNotice'],
      stickers: ['managedNotice'],
    });
  });

  it('offers only the style keys each face actually reads', () => {
    expect(projectsSchema.styleKeys).toEqual(['fontFamily']);
    expect(activityWallSchema.styleKeys).toEqual([
      'fontFamily',
      'fontColor',
      'cardColor',
    ]);
    expect(talkingToolSchema.styleKeys).toEqual(['cardColor']);
    expect(stickersSchema.styleKeys).toBeUndefined();
  });

  describe('drawer panels', () => {
    it('Projects says so when the rollout switch is off', async () => {
      vi.mocked(useProjectsWidgetSettings).mockReturnValue({ enabled: false });
      renderDrawer(makeWidget('projects'));
      expect(await screen.findByRole('note')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Go to library' })
      ).not.toBeInTheDocument();
    });

    it('Projects sends the teacher back to the library', async () => {
      const widget = makeWidget('projects', {
        view: 'board',
        projectId: 'project-a',
      });
      renderDrawer(widget);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Go to library' })
      );
      expect(updateWidget).toHaveBeenCalledWith('projects-1', {
        config: {
          view: 'manager',
          projectId: 'project-a',
          managerTab: 'library',
        },
      });
    });

    it('Projects keeps the group-row surface and no font color', () => {
      renderDrawer(makeWidget('projects'), 'style');
      expect(
        screen.getByRole('radiogroup', { name: 'Group rows color' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('radiogroup', { name: /font color/i })
      ).not.toBeInTheDocument();
    });

    it('Activity Wall points at the widget face and keeps color and surface', async () => {
      const widget = makeWidget('activity-wall');
      const { unmount } = renderDrawer(widget);
      expect(await screen.findByRole('note')).toBeInTheDocument();
      unmount();

      renderDrawer(widget, 'style');
      expect(
        screen.getByRole('radiogroup', { name: 'Font color' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('radiogroup', { name: 'Card color' })
      ).toBeInTheDocument();
    });

    it('Talking Tool keeps its admin notice and surface only', async () => {
      const widget = makeWidget('talking-tool');
      const { unmount } = renderDrawer(widget);
      expect(await screen.findByRole('note')).toBeInTheDocument();
      unmount();

      renderDrawer(widget, 'style');
      expect(
        screen.getByRole('radiogroup', { name: 'Card color' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('radiogroup', { name: /font color/i })
      ).not.toBeInTheDocument();
    });

    it('Stickers shows only the window controls on the Style tab', () => {
      renderDrawer(makeWidget('stickers'), 'style');
      expect(
        screen.getByRole('radio', { name: 'Board default' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('radiogroup', { name: /card color/i })
      ).not.toBeInTheDocument();
    });
  });
});
