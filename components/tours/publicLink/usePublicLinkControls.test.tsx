/* eslint-disable @typescript-eslint/require-await -- the fakes stand in for async calls */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { pictureFingerprint, type PublicLinkRecord } from './publicLinkModel';
import { usePublicLinkControls } from './usePublicLinkControls';

const store = vi.hoisted(() => ({
  record: null as PublicLinkRecord | null,
  listeners: new Set<(r: PublicLinkRecord | null) => void>(),
  published: null as GuidedLearningSet | null,
  turnOn: vi.fn(),
  turnOff: vi.fn(),
}));

vi.mock('./publicLinkStore', () => ({
  publicLinkDevSeed: () => null,
  watchPublicLink: (_id: string, cb: (r: PublicLinkRecord | null) => void) => {
    store.listeners.add(cb);
    cb(store.record);
    return () => store.listeners.delete(cb);
  },
  turnOnPublicLink: async (
    _id: string,
    c: { fingerprint: string; kind: 'web' | 'live'; email: string }
  ) => {
    store.turnOn(c);
    store.record = {
      token: 'a'.repeat(32),
      fingerprint: c.fingerprint,
      kind: c.kind,
      confirmedBy: c.email,
      confirmedAt: 1,
      pictures: {},
    };
    store.listeners.forEach((fn) => fn(store.record));
    return store.record;
  },
  readConfirmedPicture: async (source: string) => {
    if (source.includes('broken')) throw new Error('gone');
    return {
      path: source,
      generation: '7',
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
    };
  },
  turnOffPublicLink: async () => {
    store.turnOff();
    store.record = store.record && {
      ...store.record,
      off: { reason: 'admin', at: 2 },
    };
    store.listeners.forEach((fn) => fn(store.record));
  },
}));
vi.mock('@/components/tours/publishedTours', () => ({
  loadPublishedTour: async () => ({
    set: store.published,
    publishedAt: 1,
    publishedBy: null,
  }),
}));

// jsdom has no layout: the test says what scrolled into view.
const io = vi.hoisted(() => ({
  observers: [] as {
    cb: IntersectionObserverCallback;
    targets: Element[];
    root: Element | null;
  }[],
}));
class FakeIntersectionObserver {
  private entry: (typeof io.observers)[number];
  constructor(
    cb: IntersectionObserverCallback,
    opts?: IntersectionObserverInit
  ) {
    this.entry = { cb, targets: [], root: (opts?.root as Element) ?? null };
    io.observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.targets.push(el);
  }
  disconnect() {
    io.observers = io.observers.filter((o) => o !== this.entry);
  }
}
const scrollIntoView = (el: Element) =>
  act(() => {
    for (const o of io.observers)
      if (o.targets.includes(el))
        o.cb(
          [
            {
              target: el,
              isIntersecting: true,
            } as unknown as IntersectionObserverEntry,
          ],
          o as unknown as IntersectionObserver
        );
  });
const reviewSteps = () => screen.getAllByTestId('steps-article-step');
const reviewEnd = () => screen.getByTestId('public-link-review-end');
const confirmReason = () => screen.getByTestId('public-link-reason-confirm');

const webTour = (path = 'web_tour_pictures/w1/a.png'): GuidedLearningSet =>
  ({
    id: 'w1',
    title: 'Post a grade',
    surface: 'web',
    steps: [
      {
        id: 's1',
        label: 'Open the gradebook',
        text: 'Click Gradebook.',
        web: {
          urlPattern: 'https://x.example/*',
          action: 'click',
          picture: {
            path,
            w: 800,
            h: 450,
            target: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
          },
        },
      },
      {
        id: 's2',
        label: 'Save it',
        text: 'Click Save.',
        web: { urlPattern: 'https://x.example/*', action: 'click' },
      },
    ],
  }) as unknown as GuidedLearningSet;

const Harness: React.FC<{
  published: GuidedLearningSet | null | undefined;
}> = ({ published }) => {
  const c = usePublicLinkControls({ setId: 'w1', published });
  return (
    <div>
      <p data-testid="note">
        {c.statusNote ? `${c.statusNote.tone}:${c.statusNote.text}` : ''}
      </p>
      <div data-testid="footer">{c.footer}</div>
      {c.dialog}
    </div>
  );
};

const renderWith = (
  published: GuidedLearningSet | null | undefined,
  { admin = true, flag = true } = {}
) =>
  render(
    <AuthContext.Provider
      value={
        {
          user: { uid: 'u1', email: 'Admin@School.org' },
          isAdmin: admin,
          canAccessFeature: (id: string) => flag && id === 'tour-steps-view',
        } as unknown as AuthContextType
      }
    >
      <Harness published={published} />
    </AuthContext.Provider>
  );

const writeText = vi.fn(async (_text: string) => undefined);

const toggle = () =>
  screen.getByRole('switch', { name: 'Anyone with the link' });

beforeEach(() => {
  store.record = null;
  store.listeners.clear();
  store.published = webTour();
  store.turnOn.mockClear();
  store.turnOff.mockClear();
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:pic');
  globalThis.URL.revokeObjectURL = vi.fn();
  io.observers = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

describe('usePublicLinkControls', () => {
  it('shows nothing new while the steps-view flag is off', () => {
    renderWith(webTour(), { flag: false });
    expect(screen.queryByTestId('public-link')).toBeNull();
  });

  it('gives an author who is not an admin a disabled switch and the reason', () => {
    renderWith(webTour(), { admin: false });
    expect(toggle()).toBeDisabled();
    expect(screen.getByTestId('public-link-reason')).toHaveTextContent(
      'Only admins can share a tour publicly.'
    );
    expect(toggle()).toHaveAttribute(
      'aria-describedby',
      screen.getByTestId('public-link-reason').id
    );
  });

  it('needs a published tour first', () => {
    renderWith(null);
    expect(toggle()).toBeDisabled();
    expect(screen.getByTestId('public-link-reason')).toHaveTextContent(
      'Publish the tour first.'
    );
  });

  it('turns on only after the second confirm shows the published article and is acknowledged', async () => {
    renderWith(webTour());
    fireEvent.click(toggle());
    expect(store.turnOn).not.toHaveBeenCalled();
    const review = await screen.findByTestId('public-link-review');
    await within(review).findByText('Open the gradebook');
    expect(within(review).getByText('Save it')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(review).getByRole('img', { name: 'Picture of step 1' })
      ).toHaveAttribute('src', 'blob:pic')
    );
    const confirm = screen.getByTestId('public-link-confirm');
    const ack = screen.getByTestId('public-link-ack');
    // Not read to the end yet: both stay off, and the reason counts the steps.
    expect(confirm).toBeDisabled();
    expect(ack).toBeDisabled();
    expect(confirmReason()).toHaveTextContent(
      'Scroll to review all 2 steps (0 of 2 seen).'
    );
    scrollIntoView(reviewSteps()[0]);
    expect(confirmReason()).toHaveTextContent('(1 of 2 seen)');
    expect(ack).toBeDisabled();
    scrollIntoView(reviewSteps()[1]);
    scrollIntoView(reviewEnd());
    expect(ack).toBeEnabled();
    expect(confirm).toBeDisabled();
    expect(confirmReason()).toHaveTextContent('Tick the box first');
    expect(confirm).toHaveAttribute('aria-describedby', confirmReason().id);
    fireEvent.click(ack);
    expect(confirm).toBeEnabled();
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(store.turnOn).toHaveBeenCalledWith({
      fingerprint: pictureFingerprint(webTour()),
      kind: 'web',
      pictures: { 'web_tour_pictures/w1/a.png': '7' },
      email: 'Admin@School.org',
      previous: null,
    });
    expect(screen.queryByTestId('public-link-review')).toBeNull();
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('note')).toHaveTextContent(
      'public:Public link on'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/tour-steps/${'a'.repeat(32)}`
      )
    );
  });

  it("can't confirm a picture that didn't load", async () => {
    store.published = webTour('web_tour_pictures/w1/broken.png');
    renderWith(store.published);
    fireEvent.click(toggle());
    await screen.findAllByText(
      "A picture couldn't load, so the tour can't be made public yet."
    );
    scrollIntoView(reviewEnd());
    fireEvent.click(screen.getByTestId('public-link-ack'));
    expect(screen.getByTestId('public-link-confirm')).toBeDisabled();
  });

  it('lets the keyboard reach the end: the scrolling review takes focus', async () => {
    renderWith(webTour());
    fireEvent.click(toggle());
    await waitFor(() => expect(io.observers.length).toBe(1));
    const scroller = io.observers[0].root as HTMLElement;
    expect(scroller).toContainElement(screen.getByTestId('public-link-review'));
    expect(scroller).toHaveAttribute('tabindex', '0');
  });

  it('a tour short enough to show whole is reviewed as soon as its end is in view', async () => {
    renderWith(webTour());
    fireEvent.click(toggle());
    await waitFor(() => expect(io.observers.length).toBe(1));
    scrollIntoView(reviewEnd());
    expect(screen.getByTestId('public-link-ack')).toBeEnabled();
  });

  it('says why when the admin who made it public was removed, with Review', async () => {
    store.record = {
      token: 'a'.repeat(32),
      fingerprint: pictureFingerprint(webTour()) ?? '',
      kind: 'web',
      confirmedBy: 'former@school.org',
      confirmedAt: 1,
      pictures: {},
      off: { reason: 'confirmer', at: 2 },
    };
    renderWith(webTour());
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('public-link-paused')).toHaveTextContent(
      'The admin who made this public is no longer an admin. Review and turn it on again.'
    );
    expect(screen.getByTestId('note')).toHaveTextContent(
      'warn:Public link off'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByTestId('public-link-review')).toBeInTheDocument();
  });

  it('switches off in one click, with no confirm', async () => {
    store.record = {
      token: 'a'.repeat(32),
      fingerprint: pictureFingerprint(webTour()) ?? '',
      kind: 'web',
      confirmedBy: 'a',
      confirmedAt: 1,
      pictures: {},
    };
    renderWith(webTour());
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    await act(async () => {
      fireEvent.click(toggle());
    });
    expect(store.turnOff).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('public-link-review')).toBeNull();
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    // Switched off by hand is plain off, not a paused link that needs Review.
    expect(screen.queryByTestId('public-link-paused')).toBeNull();
  });

  it('says why after a picture change turned it off, and Review reopens the confirm', async () => {
    store.record = {
      token: 'a'.repeat(32),
      fingerprint: pictureFingerprint(webTour()) ?? '',
      kind: 'web',
      confirmedBy: 'a',
      confirmedAt: 1,
      pictures: {},
    };
    store.published = webTour('web_tour_pictures/w1/retaken.png');
    renderWith(store.published);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('public-link-paused')).toHaveTextContent(
      'A picture changed, so the public link is off. Review and turn it on again.'
    );
    expect(screen.getByTestId('note')).toHaveTextContent(
      'warn:Public link off'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByTestId('public-link-review')).toBeInTheDocument();
  });
});
