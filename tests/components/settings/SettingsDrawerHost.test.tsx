import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import { SettingsDrawerHost } from '@/components/settings/SettingsDrawerHost';
import { markSettingsOpenedLocally } from '@/components/settings/settingsOpenSignal';
import {
  resetSettingsCloseSignal,
  wasSettingsJustClosed,
} from '@/components/settings/settingsCloseSignal';
import { registerPanSetter } from '@/components/settings/panSetterRegistry';
import { WIDGET_SETTINGS_SCHEMAS } from '@/components/widgets/WidgetRegistry';
import { makeBoard, makeWidget, renderWithCanvas } from './settingsHostHarness';

vi.mock('@/hooks/useHelpResources', () => ({
  useHelpItemsForWidget: () => [],
}));
vi.mock('@/components/common/WidgetBuildingToggle', () => ({
  WidgetBuildingToggle: () => null,
}));
// Legacy panels need the full DashboardProvider; the slot itself is snapshot-tested.
vi.mock('@/components/settings/legacy/LegacySettingsSlot', () => ({
  LegacySettingsSlot: () => <div data-testid="legacy-slot" />,
}));

const updateUserPreference = vi.fn();
let flagOn = true;

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: (id: string) =>
      id === 'settings-drawer' ? flagOn : true,
    featurePermissions: [],
    dockPosition: 'bottom',
    settingsDrawerWidth: 400,
    updateUserPreference,
    isAdmin: false,
  }),
}));

const drawer = () => screen.queryByRole('dialog');

beforeEach(() => {
  flagOn = true;
  updateUserPreference.mockClear();
  resetSettingsCloseSignal();
});

afterEach(() => {
  cleanup();
});

describe('SettingsDrawerHost selection', () => {
  it('opens the drawer for a widget whose flipped goes false → true', () => {
    const w = makeWidget();
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));
    expect(drawer()).toBeNull();

    markSettingsOpenedLocally('w1');
    harness.setState({
      activeDashboard: makeBoard([{ ...w, flipped: true }]),
    });
    expect(drawer()).not.toBeNull();
    expect(drawer()).toHaveAttribute('data-widget-id', 'w1');
  });

  it('writes both flips in one updateWidgets batch when swapping widgets', async () => {
    const a = makeWidget({ id: 'a', flipped: true });
    const b = makeWidget({ id: 'b' });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([a, b]));
    expect(drawer()).toHaveAttribute('data-widget-id', 'a');

    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([a, { ...b, flipped: true }]),
      });
      return Promise.resolve();
    });

    expect(harness.updateWidgets).toHaveBeenCalledTimes(1);
    expect(harness.updateWidgets.mock.calls[0][0]).toEqual([
      { id: 'b', changes: { flipped: true } },
      { id: 'a', changes: { flipped: false } },
    ]);
    expect(drawer()).toHaveAttribute('data-widget-id', 'b');
  });

  it('closes on a board switch', () => {
    const w = makeWidget({ flipped: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));
    expect(drawer()).not.toBeNull();

    harness.setState({ activeDashboard: makeBoard([], 'b2') });
    expect(drawer()).toBeNull();
  });

  it('closes when the edited widget is deleted', () => {
    const w = makeWidget({ flipped: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));
    expect(drawer()).not.toBeNull();

    harness.setState({ activeDashboard: makeBoard([]) });
    expect(drawer()).toBeNull();
  });

  it('closes when the board becomes read-only', () => {
    const w = makeWidget({ flipped: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));
    expect(drawer()).not.toBeNull();

    harness.setState({ isActiveBoardReadOnly: true });
    expect(drawer()).toBeNull();
  });

  it('closes when the widget is un-flipped by a drag', () => {
    const w = makeWidget({ flipped: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));
    harness.setState({
      activeDashboard: makeBoard([{ ...w, flipped: false }]),
    });
    expect(drawer()).toBeNull();
  });

  it('renders nothing when the feature flag is off', () => {
    flagOn = false;
    renderWithCanvas(
      <SettingsDrawerHost />,
      makeBoard([makeWidget({ flipped: true })])
    );
    expect(drawer()).toBeNull();
  });
});

describe('SettingsDrawerHost remote opens', () => {
  it('never pans for a flipped:true that did not originate locally', async () => {
    const pan = vi.fn();
    const unregister = registerPanSetter(pan);
    const w = makeWidget();
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));

    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: true }]),
      });
      return Promise.resolve();
    });

    expect(drawer()).not.toBeNull();
    expect(pan).not.toHaveBeenCalled();
    unregister();
  });

  it('marks the widget root but does not move heading focus for a remote-originated open (finding 2)', async () => {
    const pan = vi.fn();
    const unregister = registerPanSetter(pan);
    const root = document.createElement('div');
    root.setAttribute('data-widget-id', 'w1');
    document.body.appendChild(root);
    const activeBefore = document.activeElement;

    const w = makeWidget();
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));

    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: true }]),
      });
      return Promise.resolve();
    });

    expect(drawer()).not.toBeNull();
    expect(root.hasAttribute('data-settings-target')).toBe(true);
    expect(document.activeElement).toBe(activeBefore);
    expect(pan).not.toHaveBeenCalled();
    unregister();
    root.remove();
  });
});

describe('SettingsDrawerHost read-only board', () => {
  it('renders read-only and Close clears local state without updateWidget', () => {
    // A board LOADED read-only with a stored flipped:true still opens (banner + disabled).
    const w = makeWidget({ flipped: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]), {
      isActiveBoardReadOnly: true,
    });

    expect(drawer()).not.toBeNull();
    expect(
      screen.getByText('This board is read-only. Settings cannot be changed.')
    ).toBeVisible();

    fireEvent.click(screen.getByTestId('settings-drawer-close'));
    expect(harness.updateWidget).not.toHaveBeenCalled();
    expect(drawer()).toBeNull();
    expect(wasSettingsJustClosed()).toBe(true);
  });
});

describe('SettingsDrawerHost board switch + read-only (finding 1)', () => {
  it('renders read-only for a stored flipped widget when board id and read-only change together', () => {
    const a = makeWidget({ id: 'a', flipped: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([a]));
    expect(drawer()).not.toBeNull();

    const b = makeWidget({ id: 'b', flipped: true });
    act(() => {
      harness.setState({
        activeDashboard: makeBoard([b], 'b2'),
        isActiveBoardReadOnly: true,
      });
    });

    expect(drawer()).not.toBeNull();
    expect(drawer()).toHaveAttribute('data-widget-id', 'b');
    expect(
      screen.getByText('This board is read-only. Settings cannot be changed.')
    ).toBeVisible();
  });
});

describe('SettingsDrawerHost read-only → writable unsuppress (finding 4)', () => {
  it('clears the suppressed widget and unflips it once the board becomes writable', () => {
    const w = makeWidget({ flipped: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));
    expect(drawer()).not.toBeNull();

    act(() => {
      harness.setState({ isActiveBoardReadOnly: true });
    });
    expect(drawer()).toBeNull();

    act(() => {
      harness.setState({
        isActiveBoardReadOnly: false,
        // The real store reflects the effect's updateWidget write; the mock does not.
        activeDashboard: makeBoard([{ ...w, flipped: false }]),
      });
    });

    expect(harness.updateWidget).toHaveBeenCalledWith('w1', {
      flipped: false,
    });
    expect(drawer()).toBeNull();

    harness.updateWidget.mockClear();
    markSettingsOpenedLocally('w1');
    act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: true }]),
      });
    });
    expect(drawer()).not.toBeNull();
  });
});

describe('SettingsDrawerHost maximized widgets', () => {
  it('restores a maximized widget before opening the drawer', async () => {
    const w = makeWidget({ maximized: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));

    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: true }]),
      });
      return Promise.resolve();
    });

    expect(harness.updateWidget).toHaveBeenCalledWith('w1', {
      maximized: false,
      flipped: false,
    });
    expect(drawer()).toBeNull();
  });

  it('refuses to open on a locked maximized widget', async () => {
    const w = makeWidget({ maximized: true, isLocked: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));

    await act(() => {
      harness.setState({
        activeDashboard: makeBoard([{ ...w, flipped: true }]),
      });
      return Promise.resolve();
    });

    expect(harness.updateWidget).toHaveBeenCalledWith('w1', {
      flipped: false,
    });
    expect(drawer()).toBeNull();
  });
});

describe('SettingsDrawerHost schema chunk load failure', () => {
  it('falls back to the legacy content instead of a permanent skeleton', async () => {
    const originalLoader = WIDGET_SETTINGS_SCHEMAS.clock;
    WIDGET_SETTINGS_SCHEMAS.clock = () =>
      Promise.reject(new Error('chunk load failed'));
    try {
      const w = makeWidget({ flipped: true });
      renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));

      expect(
        screen.getByTestId('settings-drawer-skeleton')
      ).toBeInTheDocument();

      await waitForElementToBeRemoved(() =>
        screen.queryByTestId('settings-drawer-skeleton')
      );
      await waitFor(() =>
        expect(screen.getByTestId('legacy-slot')).toBeInTheDocument()
      );
    } finally {
      WIDGET_SETTINGS_SCHEMAS.clock = originalLoader;
    }
  });
});

describe('SettingsDrawerHost width persistence (§4.9)', () => {
  it('resizes across the full range without touching widget geometry', () => {
    vi.useFakeTimers();
    const w = makeWidget({ flipped: true });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));
    const handle = screen.getByTestId('settings-drawer-resize');
    const before = { ...harness.getWidgets()[0] };

    for (const key of ['ArrowLeft', 'ArrowRight']) {
      for (let i = 0; i < 20; i += 1) {
        fireEvent.keyDown(handle, { key, shiftKey: true });
      }
      vi.advanceTimersByTime(250);
    }
    vi.useRealTimers();
    fireEvent.click(screen.getByTestId('settings-drawer-close'));

    const sizes = updateUserPreference.mock.calls.map((c) => c[1] as number);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(360);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(560);
    expect(
      updateUserPreference.mock.calls.every(
        (c) => c[0] === 'settingsDrawerWidth'
      )
    ).toBe(true);

    const after = harness.getWidgets()[0];
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.w).toBe(before.w);
    expect(after.h).toBe(before.h);
    const positional = ['x', 'y', 'w', 'h'];
    for (const call of harness.updateWidget.mock.calls) {
      const changes = call[1] as Record<string, unknown>;
      expect(positional.some((k) => k in changes)).toBe(false);
    }
  });
});
