import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ExtensionStatus, WebTourPortEvent } from './extensionClient';
import { WebTourHubPage } from './WebTourHubPage';

interface Hoisted {
  auth: {
    user: { uid: string } | null;
    loading: boolean;
    globalPermissionsLoaded: boolean;
    isAdmin: boolean | null;
    canAccessFeature: (id: string) => boolean;
  };
  published: unknown;
  pictures: Map<string, unknown>;
  loadPicturesOverride?: () => Promise<Map<string, unknown>>;
  ping: ExtensionStatus;
  start: Mock<(...args: unknown[]) => Promise<unknown>>;
  open: Mock<(...args: unknown[]) => Promise<unknown>>;
  onEvent: ((e: WebTourPortEvent) => void) | null;
  log: Record<'update' | 'match' | 'miss' | 'suggest' | 'end' | 'flush', Mock>;
  startLog: Mock;
}

const h = vi.hoisted((): Hoisted => ({
  auth: {
    user: { uid: 'u1' },
    loading: false,
    globalPermissionsLoaded: true,
    isAdmin: false,
    canAccessFeature: () => true,
  },
  published: null,
  pictures: new Map(),
  ping: { kind: 'none' },
  start: vi.fn(),
  open: vi.fn(),
  onEvent: null,
  log: {
    update: vi.fn(),
    match: vi.fn(),
    miss: vi.fn(),
    suggest: vi.fn(),
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
vi.mock('@/components/tours/tourRuns', async (orig) => ({
  ...(await orig<typeof import('@/components/tours/tourRuns')>()),
  startTourRunLog: (...args: unknown[]) => {
    h.startLog(...args);
    return h.log;
  },
}));
vi.mock('./webTourHub', async (orig) => ({
  ...(await orig<typeof import('./webTourHub')>()),
  loadPictures: () => h.loadPicturesOverride?.() ?? Promise.resolve(h.pictures),
}));
const link = vi.hoisted(() => ({
  setId: vi.fn<(t: string) => Promise<string | null>>(),
}));
vi.mock('./publicLinkStart', () => ({
  setIdForPublicLink: (t: string) => link.setId(t),
}));
vi.mock('./extensionClient', async (orig) => ({
  ...(await orig<typeof import('./extensionClient')>()),
  pingExtension: () => Promise.resolve(h.ping),
  startWebTour: (...args: unknown[]) => h.start(...args),
  openWebTour: (...args: unknown[]) => h.open(...args),
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
  h.pictures = new Map();
  h.loadPicturesOverride = undefined;
  h.ping = { kind: 'none' };
  h.start.mockReset();
  h.open.mockReset();
  h.startLog.mockReset();
  Object.values(h.log).forEach((fn) => fn.mockReset());
  h.onEvent = null;
  window.sessionStorage.clear();
});

describe('WebTourHubPage with an extension that opens tours itself (H4)', () => {
  const staff8: ExtensionStatus = {
    kind: 'ready',
    protocol: 8,
    version: '0.1.13',
    profile: 'staff',
  };

  it('opens the tour without asking for SpartBoard sign-in', async () => {
    h.auth.user = null;
    h.ping = staff8;
    h.open.mockResolvedValue({ ok: true, tabId: 7 });
    render(<WebTourHubPage />);
    expect(
      await screen.findByText('Your tour is open in the other tab')
    ).toBeTruthy();
    expect(h.open).toHaveBeenCalledWith('s1');
    expect(h.start).not.toHaveBeenCalled();
    expect(screen.queryByText('sign in')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    await waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
  });

  it('says so when Start again fails', async () => {
    h.ping = staff8;
    h.open
      .mockResolvedValueOnce({ ok: true, tabId: 7 })
      .mockResolvedValueOnce({ ok: false, error: 'unavailable' });
    render(<WebTourHubPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start again' }));
    expect(
      await screen.findByText("The tour couldn't start. Try again.")
    ).toBeTruthy();
  });

  it("falls back to sign-in and the handoff when the extension can't load the tour", async () => {
    h.auth.user = null;
    h.ping = staff8;
    h.open.mockResolvedValue({ ok: false, error: 'unavailable' });
    render(<WebTourHubPage />);
    expect(await screen.findByText('sign in')).toBeTruthy();
  });

  it('keeps the old flow for a 0.1.12 extension', async () => {
    h.ping = { ...staff8, protocol: 7, version: '0.1.12' };
    render(<WebTourHubPage />);
    expect(
      await screen.findByRole('button', { name: /Start tour/ })
    ).toBeTruthy();
    expect(h.open).not.toHaveBeenCalled();
  });

  it('never opens for a non-staff profile', async () => {
    h.ping = { ...staff8, profile: 'other' };
    render(<WebTourHubPage />);
    expect(await screen.findByText('Post a Schoology update')).toBeTruthy();
    expect(h.open).not.toHaveBeenCalled();
  });
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
    vi.stubEnv('VITE_SPART_EXTENSION_ID', '');
    render(<WebTourHubPage />);
    expect(await screen.findByText('Post a Schoology update')).toBeTruthy();
    expect(
      await screen.findByText(
        'Add the SpartBoard Chrome extension so this tour can point to each step on the site. For now, follow the pictures below.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Open the course')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://app.schoology.com/home'
    );
    expect(screen.queryByText('Start tour')).toBeNull();
  });

  it('reads the steps as an article, with a Walk through, in place of the plain list', async () => {
    h.ping = { kind: 'none' };
    render(<WebTourHubPage />);
    expect(await screen.findByTestId('steps-article')).toBeTruthy();
    expect(screen.getByText('Step 1')).toBeTruthy();
    expect(screen.getByText('Pick your course.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Walk through' }));
    expect(screen.getByTestId('steps-walkthrough')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Steps' }));
    expect(screen.getByTestId('steps-article')).toBeTruthy();
  });

  it('lists Message steps and the site change in the Steps view, and counts them', async () => {
    h.ping = { kind: 'none' };
    const tour = webTour();
    tour.set.steps = [
      {
        id: 'm1',
        label: 'Welcome',
        text: 'We start on Schoology.',
        message: true,
      },
      tour.set.steps[0],
      {
        id: 'm2',
        label: 'Over to Claude',
        text: 'Next we switch.',
        message: true,
      },
      {
        id: 'c',
        label: 'Upload',
        text: '',
        web: {
          urlPattern: 'https://claude.ai/customize',
          locator: { text: 'Upload' },
          action: 'click',
        },
      },
    ] as unknown as typeof tour.set.steps;
    h.published = tour;
    render(<WebTourHubPage />);
    expect(await screen.findAllByTestId('steps-article-step')).toHaveLength(4);
    expect(screen.getByText('We start on Schoology.')).toBeTruthy();
    expect(screen.getByText('Next we switch.')).toBeTruthy();
    expect(screen.getByTestId('steps-site-switch').textContent).toBe(
      'Continue on claude.ai'
    );
  });

  it('shows a step picture it loaded, and says so when one did not load', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:picture');
    URL.revokeObjectURL = vi.fn();
    const tour = webTour();
    tour.set.steps[0].web = {
      ...tour.set.steps[0].web,
      picture: { path: 'web_tour_pictures/s1/a.png', w: 800, h: 450 },
    } as never;
    tour.set.steps[1].web = {
      ...tour.set.steps[1].web,
      picture: { path: 'web_tour_pictures/s1/b.png', w: 800, h: 450 },
    } as never;
    h.published = tour;
    h.pictures = new Map([
      ['a', { mime: 'image/png', bytes: new Uint8Array([1]), w: 800, h: 450 }],
    ]);
    render(<WebTourHubPage />);
    const img = await screen.findByAltText('Picture of step 1');
    expect(img.getAttribute('src')).toBe('blob:picture');
    expect(await screen.findByText("The picture couldn't load")).toBeTruthy();
  });

  it('keeps the progress list, not the Steps view, once the extension can play the tour', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'staff' };
    render(<WebTourHubPage />);
    expect(await screen.findByText('Start tour')).toBeTruthy();
    expect(screen.queryByTestId('steps-article')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Walk through' })).toBeNull();
  });

  it('offers the extension from its store listing when it is missing', async () => {
    vi.stubEnv('VITE_SPART_EXTENSION_ID', 'abcdefghijklmnopabcdefghijklmnop');
    render(<WebTourHubPage />);
    const get = await screen.findByRole('link', {
      name: 'Get the SpartBoard extension',
    });
    expect(get.getAttribute('href')).toBe(
      'https://chromewebstore.google.com/detail/abcdefghijklmnopabcdefghijklmnop'
    );
    vi.unstubAllEnvs();
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
    expect(h.startLog).toHaveBeenCalledWith(
      's1',
      'u1',
      { v: 42, furthest: 0, surface: 'web', from: undefined, admin: false },
      expect.any(Function)
    );
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

    // A suggested fix lands on the run, scrubbed; a check run's never does (C14).
    act(() => {
      h.onEvent?.({
        type: 'web-tour/suggest',
        setId: 's1',
        stepIndex: 1,
        stepId: 'b',
        locator: { role: 'button', name: 'Post to kid@school.org' },
      });
    });
    expect(h.log.suggest).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.log.suggest.mock.calls[0])).not.toContain(
      'kid@school.org'
    );

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
    // The page subscribes in an effect, which can land after the button shows.
    await waitFor(() => expect(h.onEvent).not.toBeNull());
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
    h.start.mockReturnValue(new Promise(() => undefined));
    const { unmount } = render(<WebTourHubPage />);
    const start = await screen.findByRole('button', { name: /Start tour/ });
    await act(async () => {
      fireEvent.click(start);
      await Promise.resolve();
    });
    act(() => {
      h.onEvent?.({
        type: 'web-tour/step',
        setId: 's1',
        stepIndex: 0,
        stepId: 'a',
        match: 'none',
      });
    });
    expect(h.startLog).toHaveBeenCalledWith(
      's1',
      'u1',
      { v: 42, furthest: 0, surface: 'web', from: undefined, admin: false },
      expect.any(Function)
    );
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

  it('follows a tour it did not start without writing over its run', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'staff' };
    render(<WebTourHubPage />);
    await screen.findByRole('button', { name: /Start tour/ });
    // The page subscribes in an effect, which can land after the button shows.
    await waitFor(() => expect(h.onEvent).not.toBeNull());
    act(() => {
      h.onEvent?.({
        type: 'web-tour/step',
        setId: 's1',
        stepIndex: 1,
        stepId: 'b',
        match: 'role',
      });
    });
    expect(
      screen.getByText(
        'The tour is open in another tab. Your progress shows here.'
      )
    ).toBeTruthy();
    expect(h.startLog).not.toHaveBeenCalled();
  });

  it('continues the run this tab saved after a reload', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'staff' };
    const saved = {
      v: 42,
      startedAt: 1,
      furthest: 0,
      done: false,
      misses: ['a'],
      surface: 'web',
      weak: [],
    };
    window.sessionStorage.setItem(
      'spart:web-tour-run:s1:u1',
      JSON.stringify(saved)
    );
    render(<WebTourHubPage />);
    await screen.findByRole('button', { name: /Start tour/ });
    // The page subscribes in an effect, which can land after the button shows.
    await waitFor(() => expect(h.onEvent).not.toBeNull());
    act(() => {
      h.onEvent?.({
        type: 'web-tour/step',
        setId: 's1',
        stepIndex: 1,
        stepId: 'b',
        match: 'role',
      });
    });
    expect(h.startLog).toHaveBeenCalledWith(
      's1',
      'u1',
      expect.objectContaining({ from: saved }),
      expect.any(Function)
    );
    expect(h.log.match).toHaveBeenCalledWith('b', 'role');
  });

  it('asks for a staff profile when the extension reports no profile', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'none' };
    render(<WebTourHubPage />);
    expect(
      await screen.findByText(
        'This tour plays only in a Chrome profile signed in with your Orono staff account. For now, follow the pictures below.'
      )
    ).toBeTruthy();
  });

  it('says so when Resume fails, keeping the progress', async () => {
    h.ping = { kind: 'ready', protocol: 2, version: '1', profile: 'staff' };
    h.start.mockResolvedValue({ ok: false, error: 'no-reply' });
    render(<WebTourHubPage />);
    await screen.findByRole('button', { name: /Start tour/ });
    // The page subscribes in an effect, which can land after the button shows.
    await waitFor(() => expect(h.onEvent).not.toBeNull());
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

describe('WebTourHubPage from a public link', () => {
  const staff = {
    kind: 'ready',
    protocol: 2,
    version: '1',
    profile: 'staff',
  } as const;

  it('starts the tour once when the link asks, then drops the ask', async () => {
    window.history.replaceState(null, '', '/tour/s1?start=1');
    h.ping = staff;
    h.start.mockResolvedValue({ ok: true, tabId: 7 });
    render(<WebTourHubPage />);
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
    expect(h.start).toHaveBeenCalledWith(
      expect.objectContaining({ setId: 's1' }),
      'https://app.schoology.com/home',
      0
    );
    expect(window.location.search).toBe('');
  });

  it('starts over a finished run the extension replays, and a reload never restarts', async () => {
    window.history.replaceState(null, '', '/tour/s1?start=1');
    h.ping = staff;
    let release: (m: Map<string, unknown>) => void = () => undefined;
    const late = new Promise<Map<string, unknown>>((r) => (release = r));
    h.pictures = new Map();
    h.loadPicturesOverride = () => late;
    h.start.mockResolvedValue({ ok: true, tabId: 7 });
    render(<WebTourHubPage />);
    await waitFor(() => expect(h.onEvent).not.toBeNull());
    expect(window.location.search).toBe('');
    act(() => {
      h.onEvent?.({ type: 'web-tour/done', setId: 's1' });
    });
    await act(async () => {
      release(new Map());
      await late;
    });
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
  });

  it('does not start without the ask', async () => {
    h.ping = staff;
    render(<WebTourHubPage />);
    await screen.findByRole('button', { name: /Start tour/ });
    expect(h.start).not.toHaveBeenCalled();
  });

  it('never asks an extension that opens tours itself to open the link path', async () => {
    window.history.replaceState(null, '', '/tour/from-link?t=abc');
    h.ping = {
      kind: 'ready',
      protocol: 8,
      version: '0.1.13',
      profile: 'staff',
    };
    link.setId.mockResolvedValue(null);
    render(<WebTourHubPage />);
    await waitFor(() => expect(link.setId).toHaveBeenCalledWith('abc'));
    expect(h.open).not.toHaveBeenCalled();
  });

  it('says the tour is unavailable when the link finds no tour', async () => {
    window.history.replaceState(null, '', '/tour/from-link?t=abc');
    link.setId.mockResolvedValue(null);
    render(<WebTourHubPage />);
    expect(
      await screen.findByText(/isn.t available|unavailable/i)
    ).toBeTruthy();
    expect(link.setId).toHaveBeenCalledWith('abc');
  });
});
