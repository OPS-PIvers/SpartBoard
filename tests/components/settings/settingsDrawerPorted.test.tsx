// Ports the SettingsPanel.test.tsx behaviours the drawer answers differently
// (§3 items 2, 6 and 8, §4.5): the drawer is non-modal, never re-selects a side
// on a board pan, and hands the Escape-after-close signal to DraggableWindow.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import {
  useSettingsDrawerPlacement,
  type SettingsDrawerPlacement,
} from '@/components/settings/useSettingsDrawerPlacement';
import { DraggableWindow } from '@/components/common/DraggableWindow';
import {
  DashboardContext,
  DashboardContextValue,
} from '@/context/DashboardContextValue';
import {
  markSettingsJustClosed,
  resetSettingsCloseSignal,
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

const widget = {
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

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Non-modal: no click-outside close (SettingsPanel closes; the drawer must not)
// ---------------------------------------------------------------------------

const renderDrawer = (onClose: () => void) =>
  render(
    <SettingsDrawer
      widget={widget}
      title="Note"
      placement="right"
      width={400}
      onWidthCommit={vi.fn()}
      onClose={onClose}
      updateWidget={vi.fn()}
      updateConfig={vi.fn()}
      globalStyle={globalStyle}
      schema={null}
    />
  );

describe('SettingsDrawer is non-modal (§3 item 11)', () => {
  it('stays open on an outside pointerdown, including after onClose changes identity', () => {
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();
    const view = renderDrawer(onClose1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The panel re-armed a 50ms timer on every onClose identity change; the
    // drawer has no click-outside listener at all, so identity cannot matter.
    view.rerender(
      <SettingsDrawer
        widget={widget}
        title="Note"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={onClose2}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={globalStyle}
        schema={null}
      />
    );

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    fireEvent.pointerDown(outside, { clientX: 10, clientY: 10 });
    fireEvent.click(outside);

    expect(onClose1).not.toHaveBeenCalled();
    expect(onClose2).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('stays open when a dialog it opened is clicked', () => {
    const onClose = vi.fn();
    renderDrawer(onClose);

    // Stand in for DialogContainer's portaled overlay + its confirm button.
    const overlay = document.createElement('div');
    overlay.setAttribute('data-settings-exclude', '');
    const confirm = document.createElement('button');
    overlay.appendChild(confirm);
    document.body.appendChild(overlay);

    fireEvent.pointerDown(confirm);
    fireEvent.click(confirm);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// board-pan: the panel re-measured; the drawer must NOT re-select a side
// ---------------------------------------------------------------------------

const FALLBACK: SettingsDrawerPlacement = {
  placement: 'right',
  needsPan: false,
  rect: null,
  announcementKey: null,
};

const Probe: React.FC<{
  onRender: (p: SettingsDrawerPlacement) => void;
}> = ({ onRender }) => {
  onRender(
    useSettingsDrawerPlacement({ widgetId: 'w1', open: true, drawerWidth: 420 })
  );
  return null;
};

describe('SettingsDrawer placement ignores board-pan (§3 item 8)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1280,
      configurable: true,
    });
  });

  it('keeps the side chosen on open when the board pans underneath', () => {
    const el = document.createElement('div');
    el.setAttribute('data-widget-id', 'w1');
    let rect = { left: 900, top: 100, width: 340, height: 200 };
    el.getBoundingClientRect = () => rect as DOMRect;
    document.body.appendChild(el);

    let latest: SettingsDrawerPlacement = FALLBACK;
    render(
      <Probe
        onRender={(p) => {
          latest = p;
        }}
      />
    );
    expect(latest.placement).toBe('left');

    // A pan moves the widget to the far left; a re-measure would flip the side.
    rect = { left: 40, top: 100, width: 340, height: 200 };
    act(() => {
      window.dispatchEvent(new CustomEvent('board-pan'));
    });

    expect(latest.placement).toBe('left');
    expect(latest.rect).toEqual({
      left: 900,
      top: 100,
      width: 340,
      height: 200,
    });
  });
});

// ---------------------------------------------------------------------------
// Escape after a close, from either surface (§4.5)
// ---------------------------------------------------------------------------

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

const pressEscape = () =>
  act(() => {
    window.dispatchEvent(
      new CustomEvent('widget-keyboard-action', {
        detail: { widgetId: 'w1', key: 'Escape', shiftKey: false },
      })
    );
  });

describe('Escape after a settings close reads settingsCloseSignal (§4.5)', () => {
  beforeEach(() => {
    updateWidget.mockClear();
    resetSettingsCloseSignal();
  });

  it('does nothing after the drawer closed (flag on)', () => {
    renderWindow(true);
    // The host writes the shared signal from its own close handler.
    markSettingsJustClosed('w1');
    pressEscape();
    expect(updateWidget).not.toHaveBeenCalled();
  });

  it('does nothing after the floating panel closed (flag off)', () => {
    renderWindow(false);
    fireEvent.click(screen.getByLabelText('Close settings'));
    expect(updateWidget).toHaveBeenCalledTimes(1);
    pressEscape();
    expect(updateWidget).toHaveBeenCalledTimes(1);
  });

  it('still handles Escape when no close is pending', () => {
    renderWindow(true);
    pressEscape();
    expect(updateWidget).toHaveBeenCalledWith('w1', { flipped: false });
  });
});

// ---------------------------------------------------------------------------
// The close signal is module-level (§4.5) — it must not leak across widgets.
// ---------------------------------------------------------------------------

describe('settingsCloseSignal is scoped per widget (cross-widget isolation)', () => {
  beforeEach(() => {
    updateWidget.mockClear();
    resetSettingsCloseSignal();
  });

  it("does not swallow Escape on a different widget after this widget's settings closed", () => {
    const widget2 = { ...widget, id: 'w2', flipped: false } as WidgetData;
    const twoWidgetContext = {
      ...context,
      activeDashboard: {
        ...context.activeDashboard,
        widgets: [widget, widget2],
      },
    } as unknown as DashboardContextValue;

    render(
      <DashboardContext.Provider value={twoWidgetContext}>
        <DraggableWindow
          widget={widget}
          useSettingsDrawer={false}
          title="W1"
          globalStyle={globalStyle}
        >
          <div>W1 content</div>
        </DraggableWindow>
        <DraggableWindow
          widget={widget2}
          useSettingsDrawer={false}
          title="W2"
          globalStyle={globalStyle}
        >
          <div>W2 content</div>
        </DraggableWindow>
      </DashboardContext.Provider>
    );

    // Close w1's floating settings panel — writes the shared signal.
    fireEvent.click(screen.getByLabelText('Close settings'));
    expect(updateWidget).toHaveBeenCalledWith('w1', { flipped: false });
    updateWidget.mockClear();

    // Escape now targets w2 (e.g. the teacher just brought it to front).
    // w1's just-closed settings must not suppress w2's own Escape action.
    act(() => {
      window.dispatchEvent(
        new CustomEvent('widget-keyboard-action', {
          detail: { widgetId: 'w2', key: 'Escape', shiftKey: false },
        })
      );
    });

    expect(updateWidget).toHaveBeenCalledWith('w2', {
      minimized: true,
      flipped: false,
    });
  });
});
