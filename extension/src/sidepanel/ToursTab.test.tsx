import React, { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageToursButton, ToursTab } from './ToursTab';
import type { TourListReply } from '../tourList';

const send = vi.fn<(msg: { type: string }) => Promise<unknown>>();
const activated: (() => void)[] = [];
let pageUrl = 'https://grades.example.org/home';

const reply: TourListReply = {
  ok: true,
  list: {
    at: 1,
    admin: false,
    tours: [
      {
        id: 't1',
        title: 'Post a grade',
        host: 'grades.example.org',
        steps: 2,
        version: 1,
      },
    ],
  },
};

const steps = {
  ok: true,
  tour: {
    title: 'Post a grade',
    host: 'grades.example.org',
    steps: [
      {
        id: 'a',
        title: 'Open the gradebook',
        text: 'Pick your course.',
        onlyIfAppears: false,
        observe: false,
        picture: null,
      },
    ],
    pictures: {},
  },
};

const Shell: React.FC = () => {
  const [viewing, setViewing] = useState<string | null>(null);
  return (
    <ToursTab
      reply={reply}
      onRetry={vi.fn()}
      viewing={viewing}
      onView={setViewing}
    />
  );
};

beforeEach(() => {
  send.mockReset();
  send.mockImplementation((msg) =>
    Promise.resolve(msg.type === 'tours/steps' ? steps : { ok: true })
  );
  activated.length = 0;
  pageUrl = 'https://grades.example.org/home';
  const noEvent = { addListener: vi.fn(), removeListener: vi.fn() };
  const onActivated = {
    addListener: (fn: () => void) => activated.push(fn),
    removeListener: vi.fn(),
  };
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { sendMessage: send },
    tabs: {
      query: () => Promise.resolve([{ id: 7, url: pageUrl, active: true }]),
      onActivated,
      onUpdated: noEvent,
    },
  };
});
afterEach(() => {
  cleanup();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('ToursTab', () => {
  it('offers Start and View steps on each tour', () => {
    render(<Shell />);
    expect(
      screen.getByRole('button', { name: 'Start Post a grade' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'View steps of Post a grade' })
    ).toBeTruthy();
  });

  it('starts the tour from inside its steps and stays on the steps', async () => {
    render(<Shell />);
    fireEvent.click(
      screen.getByRole('button', { name: 'View steps of Post a grade' })
    );
    expect(await screen.findByText('Open the gradebook')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start tour' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        type: 'tours/start',
        setId: 't1',
        tabId: 7,
      })
    );
    // Starting is done once the worker answers; the article is still what the panel shows.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start tour' })).toBeTruthy()
    );
    expect(screen.getByText('Open the gradebook')).toBeTruthy();
    expect(screen.queryByText('Tours for grades.example.org')).toBeNull();
  });

  it('keeps the steps open while the teacher moves to another page', async () => {
    render(<Shell />);
    fireEvent.click(
      screen.getByRole('button', { name: 'View steps of Post a grade' })
    );
    expect(await screen.findByText('Open the gradebook')).toBeTruthy();
    pageUrl = 'https://other.example.org/page';
    activated.forEach((fn) => fn());
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(screen.getByText('Open the gradebook')).toBeTruthy();
    expect(screen.queryByText('Tours for other.example.org')).toBeNull();
  });

  it('goes back to all tours', async () => {
    render(<Shell />);
    fireEvent.click(
      screen.getByRole('button', { name: 'View steps of Post a grade' })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'All tours' }));
    expect(
      screen.getByRole('button', { name: 'Start Post a grade' })
    ).toBeTruthy();
  });

  it('says why a start failed, without leaving the steps', async () => {
    send.mockImplementation((msg) =>
      Promise.resolve(
        msg.type === 'tours/steps' ? steps : { ok: false, why: 'offline' }
      )
    );
    render(<Shell />);
    fireEvent.click(
      screen.getByRole('button', { name: 'View steps of Post a grade' })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Start tour' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Open the gradebook')).toBeTruthy();
  });
});

describe('ManageToursButton', () => {
  it('opens the Web tours page for admins only', () => {
    const create = vi.fn(() => Promise.resolve({}));
    (
      globalThis as { chrome: { tabs: { create?: unknown } } }
    ).chrome.tabs.create = create;
    const { unmount } = render(<ManageToursButton reply={reply} />);
    expect(screen.queryByRole('button', { name: 'Manage tours' })).toBeNull();
    unmount();
    render(<ManageToursButton reply={{ ok: false, why: 'offline' }} />);
    expect(screen.queryByRole('button', { name: 'Manage tours' })).toBeNull();
    cleanup();
    render(
      <ManageToursButton
        reply={
          reply.ok ? { ...reply, list: { ...reply.list, admin: true } } : reply
        }
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manage tours' }));
    expect(create).toHaveBeenCalledWith({
      url: 'https://spartboard.web.app/web-tours',
    });
  });
});
