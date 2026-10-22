import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebTourPortEvent } from './extensionProtocol';
import { WebTourHubPage } from './WebTourHubPage';

const h = vi.hoisted(() => ({
  auth: {
    user: { uid: 'u1' },
    loading: false,
    globalPermissionsLoaded: true,
    canAccessFeature: (_id: string) => true,
  },
  published: null,
  ping: { kind: 'none' },
  start: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  onEvent: null as ((e: WebTourPortEvent) => void) | null,
  log: {
    update: vi.fn(),
    match: vi.fn(),
    miss: vi.fn(),
    end: vi.fn(),
    flush: vi.fn(),
  },
  startLog: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('@/components/auth/SignInPage', () => ({
  SignInPage: () => <div>sign in</div>,
}));
vi.mock('@/components/tours/publishedTours', () => ({
  loadPublishedTour: () => Promise.resolve(h.published),
}));
vi.mock('@/components/tours/tourRuns', () => ({
  startTourRunLog: (...args: unknown[]) => {
    h.startLog(...args);
    return h.log;
  },
}));
vi.mock('./webTourHub', async (orig) => ({
  ...(await orig<typeof import('./webTourHub')>()),
  loadPictures: () => Promise.resolve(new Map()),
}));
vi.mock('./extensionClient', async (orig) => ({
  ...(await orig<typeof import('./extensionClient')>()),
  pingExtension: () => Promise.resolve(h.ping),
  startWebTour: (...args: unknown[]) => h.start(...args),
  watchWebTour: (_id: string, onEvent: (e: WebTourPortEvent) => void) => {
    h.onEvent = onEvent;
    return () => undefined;
  },
}));

const webTour = (surface: 'web' | 'spartboard' = 'web') => ({
  publishedAt: 42,
  publishedBy: 'admin',
  set: {
    id: 's1',
    title: 'Post a Schoology update',
    surface,
    steps: [
      {
        id: 'a',
        label: 'Open the course',
        text: 'Pick your course.',
        web: {
          urlPattern: 'https://app.schoology.com/home',
          locator: { role: 'link', name: 'Courses' },
          action: 'click',
        },
      },
      {
        id: 'b',
        label: 'Post',
        text: '',
        web: {
          urlPattern: 'https://app.schoology.com/course/*/updates',
          locator: { text: 'Post' },
          action: 'click',
        },
      },
    ],
  },
});

beforeEach(() => {
  window.history.replaceState(null, '', '/tour/s1');
  h.auth.user = { uid: 'u1' };
  h.auth.canAccessFeature = () => true;
  h.published = webTour();
  h.ping = { kind: 'none' };
  h.start.mockReset();
  h.startLog.mockReset();
  Object.values(h.log).forEach((fn) => fn.mockReset());
  h.onEvent = null;
});

describe('WebTourHubPage', () => {
  it('asks a signed-out visitor to sign in', async () => {
    h.auth.user = null;
    render(<WebTourHubPage />);
    expect(await screen.findByText('sign in')).toBeTruthy();
  });

  it('is unavailable when the flag is off', async () => {
    h.auth.canAccessFeature = () => false;
    render(<WebTourHubPage />);
    expect(await screen.findByText("This tour isn't available")).toBeTruthy();
  });

  it('is unavailable for a SpartBoard tour or a missing one', async () => {
    h.published = webTour('spartboard');
    const { unmount } = render(<WebTourHubPage />);
    expect(await screen.findByText("This tour isn't available")).toBeTruthy();
    unmount();
    h.published = null;
    render(<WebTourHubPage />);
    expect(await screen.findByText("This tour isn't available")).toBeTruthy();
  });

  it('shows the steps and a site link without the extension', async () => {
    render(<WebTourHubPage />);
    expect(await screen.findByText('Post a Schoology update')).toBeTruthy();
    expect(
      await screen.findByText(
        'Get the SpartBoard Chrome extension to have this tour point to each step on the site. For now, follow the pictures below.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Open the course')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://app.schoology.com/home'
    );
    expect(screen.queryByText('Start tour')).toBeNull();
  });

  it('tells a non-staff Chrome profile why the tour will not play', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'other' };
    render(<WebTourHubPage />);
    expect(
      await screen.findByText(
        'This tour plays only in a Chrome profile signed in with your Orono staff account. For now, follow the pictures below.'
      )
    ).toBeTruthy();
  });

  it('asks for an update when the extension is too old', async () => {
    h.ping = { kind: 'ready', protocol: 1, version: '1', profile: 'staff' };
    render(<WebTourHubPage />);
    expect(
      await screen.findByText(
        'Your SpartBoard extension needs an update to play this tour. For now, follow the pictures below.'
      )
    ).toBeTruthy();
  });

  it('hands the tour over, logs the run and offers resume after the tab closes', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'staff' };
    h.start.mockResolvedValue({ ok: true, tabId: 7 });
    render(<WebTourHubPage />);
    const start = await screen.findByRole('button', { name: /Start tour/ });
    await act(async () => {
      fireEvent.click(start);
      await Promise.resolve();
    });
    expect(h.start).toHaveBeenCalledWith(
      expect.objectContaining({ setId: 's1', version: 42 }),
      'https://app.schoology.com/home',
      0
    );
    expect(h.startLog).toHaveBeenCalledWith('s1', 'u1', {
      v: 42,
      furthest: 0,
      surface: 'web',
    });
    expect(
      screen.getByText(
        'The tour is open in another tab. Your progress shows here.'
      )
    ).toBeTruthy();

    act(() => {
      h.onEvent?.({
        type: 'web-tour/step',
        setId: 's1',
        stepIndex: 1,
        stepId: 'b',
        match: 'text',
      });
    });
    expect(h.log.update).toHaveBeenCalledWith({ furthest: 1 });
    expect(h.log.match).toHaveBeenCalledWith('b', 'text');

    act(() => {
      h.onEvent?.({ type: 'web-tour/closed', setId: 's1', stepIndex: 1 });
    });
    expect(h.log.flush).toHaveBeenCalled();
    expect(h.log.end).not.toHaveBeenCalled();
    const resume = screen.getByRole('button', { name: /Resume at step/ });
    await act(async () => {
      fireEvent.click(resume);
      await Promise.resolve();
    });
    expect(h.start).toHaveBeenLastCalledWith(
      expect.anything(),
      'https://app.schoology.com/',
      1
    );
    expect(h.startLog).toHaveBeenCalledTimes(1);

    act(() => {
      h.onEvent?.({ type: 'web-tour/done', setId: 's1' });
    });
    expect(h.log.end).toHaveBeenCalledWith({ done: true });
    expect(screen.getByText('You finished this tour.')).toBeTruthy();
  });

  it('says so when the extension refuses the tour', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'staff' };
    h.start.mockResolvedValue({ ok: false, error: 'refused' });
    render(<WebTourHubPage />);
    const start = await screen.findByRole('button', { name: /Start tour/ });
    await act(async () => {
      fireEvent.click(start);
      await Promise.resolve();
    });
    expect(
      screen.getByText("The tour couldn't start. Try again.")
    ).toBeTruthy();
    expect(h.startLog).not.toHaveBeenCalled();
  });

  it('ignores events for steps the tour does not have', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'staff' };
    render(<WebTourHubPage />);
    await screen.findByRole('button', { name: /Start tour/ });
    act(() => {
      h.onEvent?.({
        type: 'web-tour/step',
        setId: 's1',
        stepIndex: 0,
        stepId: 'b',
        match: 'none',
      });
      h.onEvent?.({
        type: 'web-tour/step',
        setId: 's1',
        stepIndex: 9,
        stepId: 'a',
        match: 'none',
      });
    });
    expect(h.startLog).not.toHaveBeenCalled();
    expect(h.log.match).not.toHaveBeenCalled();
  });

  it('logs a run the extension reports before the start reply, and records an exit on leaving', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'staff' };
    const { unmount } = render(<WebTourHubPage />);
    await screen.findByRole('button', { name: /Start tour/ });
    act(() => {
      h.onEvent?.({
        type: 'web-tour/step',
        setId: 's1',
        stepIndex: 0,
        stepId: 'a',
        match: 'none',
      });
    });
    expect(h.startLog).toHaveBeenCalledWith('s1', 'u1', {
      v: 42,
      furthest: 0,
      surface: 'web',
    });
    expect(h.log.match).toHaveBeenCalledWith('a', 'none');
    act(() => {
      h.onEvent?.({ type: 'web-tour/exit', setId: 's1', stepIndex: 0 });
    });
    expect(h.log.end).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /Resume at step 1/ })
    ).toBeTruthy();
    unmount();
    expect(h.log.end).toHaveBeenCalledWith({ done: false, exit: 0 });
  });

  it('says so when Resume fails, keeping the progress', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'staff' };
    h.start.mockResolvedValue({ ok: false, error: 'no-reply' });
    render(<WebTourHubPage />);
    await screen.findByRole('button', { name: /Start tour/ });
    act(() => {
      h.onEvent?.({
        type: 'web-tour/step',
        setId: 's1',
        stepIndex: 1,
        stepId: 'b',
        match: 'role',
      });
      h.onEvent?.({ type: 'web-tour/closed', setId: 's1', stepIndex: 1 });
    });
    const resume = screen.getByRole('button', { name: /Resume at step 2/ });
    await act(async () => {
      fireEvent.click(resume);
      await Promise.resolve();
    });
    expect(
      screen.getByText("The tour couldn't start. Try again.")
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Resume at step 2/ })
    ).toBeTruthy();
  });
});
