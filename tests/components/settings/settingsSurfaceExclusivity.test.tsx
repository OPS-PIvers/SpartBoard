import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DraggableWindow } from '@/components/common/DraggableWindow';
import {
  DashboardContext,
  DashboardContextValue,
} from '@/context/DashboardContextValue';
import {
  resetSettingsCloseSignal,
  wasSettingsJustClosed,
} from '@/components/settings/settingsCloseSignal';
import type { GlobalStyle, WidgetData } from '@/types';

vi.mock('@/hooks/useScreenshot', () => ({
  useScreenshot: () => ({
    takeScreenshot: vi.fn(),
    isFlashing: false,
    isCapturing: false,
  }),
}));
vi.mock('@/hooks/useHelpResources', () => ({
  useHelpItemsForWidget: () => [],
}));
vi.mock('@/components/common/WidgetBuildingToggle', () => ({
  WidgetBuildingToggle: () => null,
}));

const widget: WidgetData = {
  id: 'w1',
  type: 'text',
  x: 100,
  y: 100,
  w: 200,
  h: 200,
  z: 1,
  flipped: true,
  transparency: 1,
  config: {},
} as WidgetData;

const globalStyle = {
  fontFamily: 'sans',
  windowTransparency: 1,
} as GlobalStyle;

const updateWidget = vi.fn();

const context = {
  updateWidget,
  removeWidget: vi.fn(),
  duplicateWidget: vi.fn(),
  bringToFront: vi.fn(),
  addToast: vi.fn(),
  resetWidgetSize: vi.fn(),
  selectedWidgetId: null,
  setSelectedWidgetId: vi.fn(),
  activeDashboard: {
    id: 'b1',
    name: 'B',
    background: '',
    widgets: [widget],
    createdAt: 0,
  },
  isActiveBoardReadOnly: false,
  selectedWidgetIds: [],
  groupBuildMode: false,
  zoom: 1,
} as unknown as DashboardContextValue;

const renderWindow = (useSettingsDrawer: boolean) =>
  render(
    <DashboardContext.Provider value={context}>
      <DraggableWindow
        widget={widget}
        settings={
          useSettingsDrawer ? undefined : <div>legacy settings body</div>
        }
        useSettingsDrawer={useSettingsDrawer}
        title="Text"
        globalStyle={globalStyle}
      >
        <div>Content</div>
      </DraggableWindow>
    </DashboardContext.Provider>
  );

beforeEach(() => {
  updateWidget.mockClear();
  resetSettingsCloseSignal();
});

afterEach(() => {
  cleanup();
});

describe('settings surface exclusivity (§4.5)', () => {
  it('does not mount the floating panel when the drawer owns settings', () => {
    renderWindow(true);
    expect(screen.queryByText('legacy settings body')).toBeNull();
    expect(document.querySelector('[data-widget-portal]')).toBeNull();
  });

  it('still mounts the floating panel with the flag off', () => {
    renderWindow(false);
    expect(screen.getByText('legacy settings body')).toBeInTheDocument();
    expect(document.querySelector('[data-widget-portal]')).not.toBeNull();
  });

  it('writes the shared close signal from the floating panel close path', () => {
    renderWindow(false);
    expect(wasSettingsJustClosed('w1')).toBe(false);
    const close = screen.getByLabelText('Close settings');
    fireEvent.click(close);
    expect(wasSettingsJustClosed('w1')).toBe(true);
    expect(updateWidget).toHaveBeenCalledWith('w1', { flipped: false });
  });

  it('exposes the gear button as the drawer opener target', () => {
    render(
      <DashboardContext.Provider
        value={
          {
            ...context,
            selectedWidgetId: 'w1',
          } as unknown as DashboardContextValue
        }
      >
        <DraggableWindow
          widget={{ ...widget, flipped: false }}
          settings={undefined}
          useSettingsDrawer
          title="Text"
          globalStyle={globalStyle}
        >
          <div>Content</div>
        </DraggableWindow>
      </DashboardContext.Provider>
    );
    expect(
      document.querySelector('[data-settings-opener="w1"]')
    ).not.toBeNull();
  });
});

describe('edited-widget ring target (§3 item 9)', () => {
  it('marks the DraggableWindow root, not the drawer portal', () => {
    renderWindow(true);
    const root = document.querySelector(
      '[data-widget-id="w1"]:not([data-widget-portal])'
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-widget-portal')).toBeNull();
  });
});
