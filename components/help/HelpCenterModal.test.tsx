import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpCenterModal } from './HelpCenterModal';
import {
  HELP_OPEN_EVENT,
  requestOpenHelp,
  type HelpOpenRequest,
  type HelpTab,
} from './helpCenterState';
import type { WidgetType } from '@/types';

vi.mock('./HelpGuidesTab', () => ({
  HelpGuidesTab: ({ widgetType }: { widgetType?: string }) => (
    <div data-testid="guides-tab">{`Guides tab ${widgetType ?? 'none'}`}</div>
  ),
}));

const Harness: React.FC<{
  initialTab: HelpTab;
  onClose?: () => void;
  widgetType?: WidgetType;
}> = ({ initialTab, onClose, widgetType }) => {
  const [tab, setTab] = React.useState<HelpTab>(initialTab);
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  return (
    <HelpCenterModal
      isOpen={open}
      tab={tab}
      widgetType={widgetType}
      onTabChange={setTab}
      onClose={() => {
        setOpen(false);
        onClose?.();
      }}
    />
  );
};

describe('HelpCenterModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens on the Shortcuts tab and lists shortcuts', () => {
    render(<Harness initialTab="shortcuts" />);
    expect(screen.getByText('Open Help')).toBeInTheDocument();
    expect(screen.getAllByText('Switch boards').length).toBeGreaterThan(0);
  });

  it('opens on the Guides tab and passes the widget type through', () => {
    render(<Harness initialTab="guides" widgetType="clock" />);
    expect(screen.getByTestId('guides-tab')).toHaveTextContent(
      'Guides tab clock'
    );
    expect(screen.queryAllByText('Switch boards')).toHaveLength(0);
  });

  it('dispatches the open request with the requested tab', () => {
    const listener = vi.fn();
    window.addEventListener(HELP_OPEN_EVENT, listener);
    requestOpenHelp({ tab: 'guides', widgetType: 'clock' });
    window.removeEventListener(HELP_OPEN_EVENT, listener);

    const detail = (listener.mock.calls[0][0] as CustomEvent<HelpOpenRequest>)
      .detail;
    expect(detail).toEqual({ tab: 'guides', widgetType: 'clock' });
  });

  it('narrows the shortcut list as the user searches', async () => {
    const user = userEvent.setup();
    render(<Harness initialTab="shortcuts" />);
    await user.type(screen.getByRole('searchbox'), 'switch boards');
    expect(screen.getAllByText('Switch boards').length).toBeGreaterThan(0);
    expect(screen.queryByText('Clear entire board')).not.toBeInTheDocument();
  });

  it('fires the onboarding signal on mount', () => {
    const listener = vi.fn();
    window.addEventListener('spart:cheatsheet-opened', listener);
    render(<Harness initialTab="shortcuts" />);
    window.removeEventListener('spart:cheatsheet-opened', listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('spart_cheatsheet_opened')).toBe('true');
  });

  it('moves tab selection and focus with ArrowRight', () => {
    render(<Harness initialTab="shortcuts" />);
    const [shortcutsTab, guidesTab] = screen.getAllByRole('tab');
    expect(shortcutsTab).toHaveAttribute('aria-selected', 'true');
    expect(guidesTab).toHaveAttribute('tabindex', '-1');

    shortcutsTab.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

    expect(guidesTab).toHaveAttribute('aria-selected', 'true');
    expect(guidesTab).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(guidesTab);
    expect(screen.getByTestId('guides-tab')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Harness initialTab="shortcuts" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
