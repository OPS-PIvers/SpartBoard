import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import {
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_WIDTH,
} from '@/components/settings/drawerConstants';
import type { WidgetSettingsSchema } from '@/components/settings/schema/types';
import type { GlobalStyle, WidgetData } from '@/types';

const widget = {
  id: 'w1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
  config: {},
} as WidgetData;

const globalStyle = { windowTransparency: 0.5 } as GlobalStyle;

const schema: WidgetSettingsSchema = {
  styleKeys: ['fontFamily'],
  groups: [
    {
      id: 'content',
      fields: [{ type: 'text', key: 'headline', label: 'Headline' }],
    },
    {
      id: 'behavior',
      fields: [{ type: 'toggle', key: 'autoStart', label: 'Auto start' }],
    },
  ],
};

type Overrides = Partial<React.ComponentProps<typeof SettingsDrawer>>;

function renderDrawer(overrides: Overrides = {}) {
  const props: React.ComponentProps<typeof SettingsDrawer> = {
    widget,
    title: 'Clock',
    placement: 'right',
    width: 400,
    onWidthCommit: vi.fn(),
    onClose: vi.fn(),
    updateWidget: vi.fn(),
    updateConfig: vi.fn(),
    globalStyle,
    schema,
    ...overrides,
  };
  const utils = render(<SettingsDrawer {...props} />);
  return { ...utils, props };
}

const dialog = () => screen.getByRole('dialog');
const filter = () => screen.getByRole('textbox', { name: 'Find a setting' });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('SettingsDrawer chrome', () => {
  it('portals with both widget data attributes and a non-modal dialog role', () => {
    renderDrawer();
    const root = dialog();
    expect(root).toHaveAttribute('data-widget-portal', '');
    expect(root).toHaveAttribute('data-widget-id', 'w1');
    expect(root).toHaveAttribute('aria-modal', 'false');
    expect(root.parentElement).toBe(document.body);
    expect(screen.getByRole('heading', { name: 'Clock' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('prefers customTitle over the fallback title', () => {
    renderDrawer({ widget: { ...widget, customTitle: 'My clock' } });
    expect(screen.getByRole('heading', { name: 'My clock' })).toBeVisible();
  });

  it('does not bubble clicks to ancestors, so the board never deselects the edited widget', () => {
    const onAncestorClick = vi.fn();
    const props: React.ComponentProps<typeof SettingsDrawer> = {
      widget,
      title: 'Clock',
      placement: 'right',
      width: 400,
      onWidthCommit: vi.fn(),
      onClose: vi.fn(),
      updateWidget: vi.fn(),
      updateConfig: vi.fn(),
      globalStyle,
      schema,
    };
    render(
      <div onClick={onAncestorClick}>
        <SettingsDrawer {...props} />
      </div>
    );
    fireEvent.click(filter());
    fireEvent.click(dialog());
    expect(onAncestorClick).not.toHaveBeenCalled();
    // DraggableWindow's useClickOutside deselects on pointerdown unless this marker is present.
    expect(dialog()).toHaveAttribute('data-click-outside-ignore', 'true');
  });

  it('closes from the close button, which carries the test id and a t() label', () => {
    const { props } = renderDrawer();
    const close = screen.getByTestId('settings-drawer-close');
    expect(close).toHaveAttribute('aria-label', 'Close settings');
    fireEvent.click(close);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a skeleton while the schema is loading and the empty text for legacy widgets', () => {
    renderDrawer({ schema: undefined });
    expect(screen.getByTestId('settings-drawer-skeleton')).toBeInTheDocument();
    cleanup();
    renderDrawer({ schema: null });
    expect(screen.getByText('Standard settings available.')).toBeVisible();
  });

  it('renders the legacy settings slot in place of the schema', () => {
    renderDrawer({
      schema: null,
      legacySettingsContent: <p>legacy settings body</p>,
    });
    expect(screen.getByText('legacy settings body')).toBeVisible();
  });

  it('renders the legacy style slot plus the Window tier on the Style tab', () => {
    renderDrawer({
      schema: null,
      legacyStyleContent: <p>legacy style body</p>,
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    expect(screen.getByText('legacy style body')).toBeVisible();
    expect(screen.getByText('Window transparency (Global)')).toBeVisible();
  });

  it('renders exactly one background control on the Style tab', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    expect(screen.getAllByText('Background Color')).toHaveLength(1);
  });

  it('moves focus and selection to the next tab on ArrowRight, matching the shared tablist pattern', () => {
    renderDrawer();
    const settingsTab = screen.getByRole('tab', { name: 'Settings' });
    const styleTab = screen.getByRole('tab', { name: 'Style' });
    settingsTab.focus();
    fireEvent.keyDown(settingsTab, { key: 'ArrowRight' });
    expect(styleTab).toHaveFocus();
    expect(styleTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Window transparency (Global)')).toBeVisible();
  });

  it('wraps from the last tab to the first on ArrowRight and keeps only the active tab tabbable', () => {
    renderDrawer();
    const settingsTab = screen.getByRole('tab', { name: 'Settings' });
    const styleTab = screen.getByRole('tab', { name: 'Style' });
    expect(settingsTab).toHaveAttribute('tabindex', '0');
    expect(styleTab).toHaveAttribute('tabindex', '-1');
    styleTab.focus();
    fireEvent.keyDown(styleTab, { key: 'ArrowRight' });
    expect(settingsTab).toHaveFocus();
    expect(settingsTab).toHaveAttribute('tabindex', '0');
    expect(styleTab).toHaveAttribute('tabindex', '-1');
  });
});

describe('SettingsDrawer read-only mode', () => {
  it('renders the banner, disables the fields and still closes', () => {
    const { props } = renderDrawer({ readOnly: true });
    expect(
      screen.getByText('This board is read-only. Settings cannot be changed.')
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Headline' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('settings-drawer-close'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsDrawer find-a-setting filter', () => {
  it('matches across both tabs at once and hides the tab bar', () => {
    renderDrawer();
    fireEvent.change(filter(), { target: { value: 'font' } });
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('Font')).toBeVisible();
    expect(screen.queryByText('Headline')).toBeNull();
  });

  it('restores the previously selected tab when cleared', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    fireEvent.change(filter(), { target: { value: 'auto' } });
    expect(screen.getByText('Auto start')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('tab', { name: 'Style' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('shows the no-match text with the query', () => {
    renderDrawer();
    fireEvent.change(filter(), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No settings match "zzzz"\./)).toBeVisible();
  });

  it('appends the legacy note when the widget is still on the legacy slot', () => {
    renderDrawer({ schema: null });
    fireEvent.change(filter(), { target: { value: 'zzzz' } });
    expect(
      screen.getByText(/settings are not searchable yet/)
    ).toBeInTheDocument();
  });
});

describe('SettingsDrawer escape ladder', () => {
  it('clears the query, then blurs, then closes', () => {
    const { props } = renderDrawer();
    const input = filter();
    fireEvent.change(input, { target: { value: 'font' } });
    input.focus();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('');
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).not.toBe(input);
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape inside any other form field', () => {
    const { props } = renderDrawer();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Headline' }), {
      key: 'Escape',
    });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('stops propagation so window-level guards never see the handled Escape', () => {
    renderDrawer();
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    window.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('SettingsDrawer resize handle', () => {
  const handle = () => screen.getByTestId('settings-drawer-resize');

  it('exposes separator semantics in px for a side drawer', () => {
    renderDrawer();
    const separator = handle();
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute(
      'aria-valuemin',
      String(DRAWER_MIN_WIDTH)
    );
    expect(separator).toHaveAttribute(
      'aria-valuemax',
      String(DRAWER_MAX_WIDTH)
    );
    expect(separator).toHaveAttribute('aria-valuenow', '400');
  });

  it('exposes vh semantics for the bottom sheet', () => {
    renderDrawer({ placement: 'bottom', width: 50 });
    const separator = handle();
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    expect(separator).toHaveAttribute('aria-valuemin', '35');
    expect(separator).toHaveAttribute('aria-valuemax', '85');
  });

  it('grows and shrinks with the arrow keys, 64px with Shift, committing once idle', () => {
    vi.useFakeTimers();
    const { props } = renderDrawer();
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(props.onWidthCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(props.onWidthCommit).toHaveBeenLastCalledWith(416);

    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    vi.advanceTimersByTime(250);
    expect(props.onWidthCommit).toHaveBeenLastCalledWith(400);

    fireEvent.keyDown(handle(), { key: 'ArrowLeft', shiftKey: true });
    vi.advanceTimersByTime(250);
    expect(props.onWidthCommit).toHaveBeenLastCalledWith(464);
    vi.useRealTimers();
  });

  it('commits once for a burst of arrow presses (finding 3)', () => {
    vi.useFakeTimers();
    const { props } = renderDrawer();
    for (let i = 0; i < 5; i += 1) {
      fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    }
    expect(props.onWidthCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(props.onWidthCommit).toHaveBeenCalledTimes(1);
    expect(props.onWidthCommit).toHaveBeenCalledWith(
      Math.max(DRAWER_MIN_WIDTH, 400 - 5 * 16)
    );
    vi.useRealTimers();
  });

  it('clamps to the 360-560 range', () => {
    vi.useFakeTimers();
    const { props } = renderDrawer({ width: DRAWER_MAX_WIDTH });
    for (let i = 0; i < 5; i += 1) {
      fireEvent.keyDown(handle(), { key: 'ArrowLeft', shiftKey: true });
    }
    vi.advanceTimersByTime(250);
    expect(props.onWidthCommit).toHaveBeenLastCalledWith(DRAWER_MAX_WIDTH);
    vi.useRealTimers();
    cleanup();

    vi.useFakeTimers();
    const small = renderDrawer({ width: DRAWER_MIN_WIDTH });
    for (let i = 0; i < 5; i += 1) {
      fireEvent.keyDown(handle(), { key: 'ArrowRight', shiftKey: true });
    }
    vi.advanceTimersByTime(250);
    expect(small.props.onWidthCommit).toHaveBeenLastCalledWith(
      DRAWER_MIN_WIDTH
    );
    vi.useRealTimers();
  });

  it('re-clamps when placement changes with the same width prop', () => {
    const { rerender, props } = renderDrawer({
      placement: 'right',
      width: 400,
    });
    rerender(<SettingsDrawer {...props} placement="bottom" />);
    const separator = handle();
    const now = Number(separator.getAttribute('aria-valuenow'));
    expect(now).toBeGreaterThanOrEqual(35);
    expect(now).toBeLessThanOrEqual(85);
    expect(separator).toHaveAttribute('aria-valuenow', String(now));
  });

  it('commits a pointer drag only when it ends', () => {
    const { props } = renderDrawer();
    const separator = handle();
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 900 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 860 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 840 });
    expect(props.onWidthCommit).not.toHaveBeenCalled();
    expect(separator).toHaveAttribute('aria-valuenow', '460');
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 840 });
    expect(props.onWidthCommit).toHaveBeenCalledTimes(1);
    expect(props.onWidthCommit).toHaveBeenCalledWith(460);
  });
});

describe('SettingsDrawer never moves widgets (§4.9)', () => {
  it('writes no positional keys across a full 360-560 resize sweep', () => {
    const updateWidget = vi.fn();
    const updateConfig = vi.fn();
    const { props } = renderDrawer({ updateWidget, updateConfig });
    const separator = screen.getByTestId('settings-drawer-resize');
    const before = { ...widget };

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 1000 });
    for (let x = 1000; x >= 800; x -= 10) {
      fireEvent.pointerMove(separator, { pointerId: 1, clientX: x });
    }
    for (let x = 800; x <= 1100; x += 10) {
      fireEvent.pointerMove(separator, { pointerId: 1, clientX: x });
    }
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 1100 });
    fireEvent.click(screen.getByTestId('settings-drawer-close'));

    expect(updateWidget).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
    expect(widget).toEqual(before);
  });
});
