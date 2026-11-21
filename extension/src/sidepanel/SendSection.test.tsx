import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SendBar, useSendPanel } from './SendSection';

const send =
  vi.fn<(msg: { type: string; action?: string }) => Promise<unknown>>();
let enabled = true;

const Bar: React.FC = () => <SendBar panel={useSendPanel()} />;

beforeEach(() => {
  enabled = true;
  send.mockReset();
  send.mockImplementation((msg) =>
    Promise.resolve(
      msg.action === 'state'
        ? {
            enabled,
            showOnPages: true,
            host: 'grades.example.org',
            hiddenHere: false,
            blocked: false,
          }
        : { ok: true }
    )
  );
  const noEvent = { addListener: vi.fn(), removeListener: vi.fn() };
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { sendMessage: send },
    tabs: {
      query: () =>
        Promise.resolve([
          { id: 7, url: 'https://grades.example.org/home', active: true },
        ]),
      onActivated: noEvent,
      onUpdated: noEvent,
    },
  };
});
afterEach(() => {
  cleanup();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('SendBar', () => {
  it('sends the open page', async () => {
    render(<Bar />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Send this page to SpartBoard',
      })
    );
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        type: 'send/panel',
        action: 'send',
        tabId: 7,
      })
    );
  });

  it('keeps the settings behind the gear', async () => {
    render(<Bar />);
    const gear = await screen.findByRole('button', { name: 'Send settings' });
    expect(
      screen.queryByRole('switch', { name: 'Show Send button on pages' })
    ).toBeNull();
    fireEvent.click(gear);
    expect(gear.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByRole('switch', { name: 'Hide on grades.example.org' })
    ).toBeTruthy();
  });

  it('shows nothing when Send is off for this account', async () => {
    enabled = false;
    render(<Bar />);
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Send settings' })).toBeNull();
  });
});
