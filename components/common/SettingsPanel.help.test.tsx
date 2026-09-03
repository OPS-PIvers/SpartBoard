import React, { useRef } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsPanel } from '@/components/common/SettingsPanel';
import { HELP_OPEN_EVENT } from '@/components/help/helpCenterState';
import { WidgetData, GlobalStyle } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';

vi.mock('@/components/common/WidgetBuildingToggle', () => ({
  WidgetBuildingToggle: () => null,
}));

vi.mock('@/components/common/UniversalStyleSettings', () => ({
  UniversalStyleSettings: () => null,
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ zoom: 1 }),
}));

const mockUseHelpItemsForWidget = vi.fn<() => HelpResourceItem[]>(() => []);
vi.mock('@/hooks/useHelpResources', () => ({
  useHelpItemsForWidget: () => mockUseHelpItemsForWidget(),
}));

const MOCK_WIDGET: WidgetData = {
  id: 'w1',
  type: 'clock',
  x: 100,
  y: 100,
  w: 200,
  h: 150,
  z: 1,
  flipped: true,
  config: {},
};

const MOCK_GLOBAL_STYLE: GlobalStyle = {
  fontFamily: 'sans',
  windowTransparency: 0.8,
  windowBorderRadius: '2xl',
  dockTransparency: 0.4,
  dockBorderRadius: 'full',
  dockTextColor: '#334155',
  dockTextShadow: false,
};

const MOCK_HELP_ITEM: HelpResourceItem = {
  id: 'h1',
  kind: 'embed',
  title: 'Using the clock',
  description: 'Body text',
  categoryId: 'widgets',
  order: 0,
  visible: true,
  orgId: null,
  widgetTypes: ['clock'],
  url: null,
  embedType: null,
  setId: null,
  openCount: 0,
  createdBy: 'uid',
  createdByEmail: 'teacher@example.com',
  createdAt: 0,
  updatedAt: 0,
};

const Harness: React.FC<{ onClose?: () => void }> = ({ onClose = vi.fn() }) => {
  const widgetRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={widgetRef} data-testid="fake-widget" />
      <SettingsPanel
        widget={MOCK_WIDGET}
        widgetRef={widgetRef}
        settings={<div data-testid="settings-content">Settings</div>}
        shouldRenderSettings
        onClose={onClose}
        updateWidget={vi.fn()}
        globalStyle={MOCK_GLOBAL_STYLE}
        title="Test Widget"
      />
    </>
  );
};

describe('SettingsPanel help button', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    mockUseHelpItemsForWidget.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders no help button when there are no help items for the widget', () => {
    mockUseHelpItemsForWidget.mockReturnValue([]);
    act(() => {
      render(<Harness />);
    });
    expect(
      screen.queryByLabelText('Guides for this widget')
    ).not.toBeInTheDocument();
  });

  it('dispatches spart:open-help with the widget type and closes the panel when clicked', () => {
    mockUseHelpItemsForWidget.mockReturnValue([MOCK_HELP_ITEM]);
    const onClose = vi.fn();
    const listener = vi.fn();
    window.addEventListener(HELP_OPEN_EVENT, listener);

    try {
      act(() => {
        render(<Harness onClose={onClose} />);
      });

      const button = screen.getByLabelText('Guides for this widget');
      act(() => {
        fireEvent.click(button);
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({ tab: 'guides', widgetType: 'clock' });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(HELP_OPEN_EVENT, listener);
    }
  });
});
