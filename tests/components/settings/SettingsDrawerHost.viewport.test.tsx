// Host-level coverage the hook tests cannot give: the bottom sheet the host
// actually renders below the 900px breakpoint (§3 item 10), and focus returning
// to the real opener the host resolves from the DOM (§3 item 11).

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import { SettingsDrawerHost } from '@/components/settings/SettingsDrawerHost';
import { markSettingsOpenedLocally } from '@/components/settings/settingsOpenSignal';
import { resetSettingsCloseSignal } from '@/components/settings/settingsCloseSignal';
import { registerPanSetter } from '@/components/settings/panSetterRegistry';
import { makeBoard, makeWidget, renderWithCanvas } from './settingsHostHarness';

vi.mock('@/hooks/useHelpResources', () => ({
  useHelpItemsForWidget: () => [],
}));
vi.mock('@/components/common/WidgetBuildingToggle', () => ({
  WidgetBuildingToggle: () => null,
}));
vi.mock('@/components/settings/legacy/LegacySettingsSlot', () => ({
  LegacySettingsSlot: () => <div data-testid="legacy-slot" />,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => true,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetDefault: vi.fn(),
    dockPosition: 'bottom',
    settingsDrawerWidth: 400,
    updateUserPreference: vi.fn(),
    isAdmin: false,
  }),
}));

const drawer = () => screen.queryByRole('dialog');

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    configurable: true,
  });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
};

/** Stands in for the DraggableWindow root and its gear button. */
const mountWidgetChrome = (id: string) => {
  const root = document.createElement('div');
  root.setAttribute('data-widget-id', id);
  const gear = document.createElement('button');
  gear.setAttribute('data-settings-opener', id);
  document.body.append(root, gear);
  return { root, gear };
};

beforeEach(() => {
  resetSettingsCloseSignal();
  setViewport(1280, 800);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('SettingsDrawerHost bottom sheet (§3 item 10)', () => {
  it('renders a sheet with vh resize semantics and never pans at 820px', async () => {
    const pan = vi.fn();
    const unregister = registerPanSetter(pan);
    setViewport(820, 640);
    mountWidgetChrome('w1');

    const w = makeWidget();
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));
    markSettingsOpenedLocally('w1');
    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: true }]),
      });
      return Promise.resolve();
    });

    const root = drawer();
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('data-placement', 'bottom');

    const handle = screen.getByTestId('settings-drawer-resize');
    expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
    expect(handle).toHaveAttribute('aria-valuemin', '35');
    expect(handle).toHaveAttribute('aria-valuemax', '85');
    expect(handle).toHaveAttribute('aria-valuenow', '50');

    expect(pan).not.toHaveBeenCalled();
    unregister();
  });
});

describe('SettingsDrawerHost focus return (§3 item 11)', () => {
  it('returns focus to the gear the host resolved when the drawer closes', async () => {
    const { gear } = mountWidgetChrome('w1');
    const w = makeWidget();
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));

    markSettingsOpenedLocally('w1');
    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: true }]),
      });
      return Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByRole('heading'));

    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: false }]),
      });
      return Promise.resolve();
    });
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(gear);
  });

  it('falls back to the widget root when the gear is gone', async () => {
    const { root, gear } = mountWidgetChrome('w1');
    const w = makeWidget();
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));

    markSettingsOpenedLocally('w1');
    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: true }]),
      });
      return Promise.resolve();
    });

    gear.remove();
    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: false }]),
      });
      return Promise.resolve();
    });
    expect(document.activeElement).toBe(root);
  });
});
