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
  published: null,
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
    };
    store.listeners.forEach((fn) => fn(store.record));
    return store.record;
  },
  turnOffPublicLink: async () => {
    store.turnOff();
    store.record = null;
    store.listeners.forEach((fn) => fn(null));
  },
}));
vi.mock('@/components/tours/publishedTours', () => ({
  loadPublishedTour: async () => ({
    set: store.published,
    publishedAt: 1,
    publishedBy: null,
  }),
}));
vi.mock('@/components/tours/webTours', async (orig) => ({
  ...(await orig<typeof import('@/components/tours/webTours')>()),
  loadWebTourPicture: async (path: string) => {
    if (path.includes('broken')) throw new Error('gone');
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer;
  },
}));

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
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('title', 'Tick the box first');
    fireEvent.click(screen.getByTestId('public-link-ack'));
    expect(confirm).toBeEnabled();
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(store.turnOn).toHaveBeenCalledWith({
      fingerprint: pictureFingerprint(webTour()),
      kind: 'web',
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
    await screen.findByText(
      "A picture couldn't load, so the tour can't be made public yet."
    );
    fireEvent.click(screen.getByTestId('public-link-ack'));
    expect(screen.getByTestId('public-link-confirm')).toBeDisabled();
  });

  it('switches off in one click, with no confirm', async () => {
    store.record = {
      token: 'a'.repeat(32),
      fingerprint: pictureFingerprint(webTour()) ?? '',
      kind: 'web',
      confirmedBy: 'a',
      confirmedAt: 1,
    };
    renderWith(webTour());
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    await act(async () => {
      fireEvent.click(toggle());
    });
    expect(store.turnOff).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('public-link-review')).toBeNull();
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('says why after a picture change turned it off, and Review reopens the confirm', async () => {
    store.record = {
      token: 'a'.repeat(32),
      fingerprint: pictureFingerprint(webTour()) ?? '',
      kind: 'web',
      confirmedBy: 'a',
      confirmedAt: 1,
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
