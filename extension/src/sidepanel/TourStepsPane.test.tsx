import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourStepsPane } from './TourStepsPane';
import type { TourStepsReply } from '../tourSteps';

const send = vi.fn<(msg: object) => Promise<TourStepsReply>>();
const createTab = vi.fn(() => Promise.resolve({}));

beforeEach(() => {
  send.mockReset();
  createTab.mockClear();
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { sendMessage: send },
    tabs: { create: createTab },
  };
});
afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

const tour = {
  id: 'set1',
  title: 'Post a grade',
  host: 'app.example',
  steps: 2,
  version: 1,
};

const ok: TourStepsReply = {
  ok: true,
  tour: {
    title: 'Post a grade',
    host: 'app.example',
    steps: [
      {
        id: 'a',
        title: 'Open the gradebook',
        text: 'Pick your course.',
        onlyIfAppears: false,
        observe: false,
        picture: { w: 800, h: 400, cssW: 800, target: null },
      },
      {
        id: 'b',
        title: 'Check the list',
        text: '',
        onlyIfAppears: true,
        observe: true,
        picture: null,
      },
    ],
    pictures: { a: { status: 'ready', src: 'data:image/png;base64,AA' } },
  },
};

const pane = (
  over: Partial<React.ComponentProps<typeof TourStepsPane>> = {}
) => (
  <TourStepsPane
    tour={tour}
    onBack={vi.fn()}
    onStart={vi.fn()}
    starting={false}
    disabled={false}
    {...over}
  />
);

describe('TourStepsPane', () => {
  it('asks the worker for the steps and shows them as an article', async () => {
    send.mockResolvedValue(ok);
    render(pane());
    expect(await screen.findByText('Open the gradebook')).toBeTruthy();
    expect(send).toHaveBeenCalledWith({ type: 'tours/steps', setId: 'set1' });
    expect(screen.getByText('Only if it appears')).toBeTruthy();
    expect(screen.getByAltText('Picture of step 1')).toBeTruthy();
    // The panel cannot draw the tour's chrome, so it offers no Walk through or Print.
    expect(screen.queryByRole('button', { name: 'Walk through' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
  });

  it('shows the steps loading, then the reason when they cannot load, and tries again', async () => {
    send.mockResolvedValueOnce({ ok: false, why: 'offline' });
    render(pane());
    expect(screen.getByRole('status', { name: 'Loading steps' })).toBeTruthy();
    expect(
      await screen.findByText(
        "The steps couldn't load. Check your connection and try again."
      )
    ).toBeTruthy();
    send.mockResolvedValueOnce(ok);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Open the gradebook')).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('says the tour is gone when it is no longer published', async () => {
    send.mockResolvedValue({ ok: false, why: 'not-found' });
    render(pane());
    expect(
      await screen.findByText('That tour is no longer published.')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('starts the tour and goes back from the article', async () => {
    send.mockResolvedValue(ok);
    const onStart = vi.fn();
    const onBack = vi.fn();
    render(pane({ onStart, onBack }));
    await waitFor(() =>
      expect(screen.getByText('Open the gradebook')).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start tour' }));
    fireEvent.click(screen.getByRole('button', { name: 'All tours' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('says Starting while the tour starts', async () => {
    send.mockResolvedValue(ok);
    render(pane({ starting: true, disabled: true }));
    expect(
      await screen.findByRole('button', { name: 'Starting...' })
    ).toBeTruthy();
  });

  it('copies the public link when the tour has one', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const token = 'a'.repeat(32);
    if (!ok.ok) throw new Error('fixture');
    send.mockResolvedValue({ ok: true, tour: { ...ok.tour, link: token } });
    render(pane());
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `https://spartboard.web.app/tour-steps/${token}`
      )
    );
    expect(
      await screen.findByRole('button', { name: 'Link copied' })
    ).toBeTruthy();
  });

  it('offers no link for a tour without one', async () => {
    send.mockResolvedValue(ok);
    render(pane());
    await screen.findByText('Open the gradebook');
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });

  it('opens the editor for admins only', async () => {
    send.mockResolvedValue(ok);
    const { unmount } = render(pane());
    await screen.findByText('Open the gradebook');
    expect(screen.queryByRole('button', { name: 'Edit tour' })).toBeNull();
    unmount();
    render(pane({ admin: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit tour' }));
    expect(createTab).toHaveBeenCalledWith({
      url: 'https://spartboard.web.app/?edit-web-tour=set1',
    });
  });
});
