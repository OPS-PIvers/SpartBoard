/* eslint-disable @typescript-eslint/require-await -- the fakes stand in for async calls */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicTourPage } from './PublicTourPage';

const TOKEN = '0123456789abcdef0123456789abcdef';

const tour = {
  kind: 'web',
  title: 'Post a grade',
  steps: [
    {
      id: 's1',
      title: 'Open the gradebook',
      text: 'Click Gradebook.',
      onlyIfAppears: true,
      observe: false,
      picture: {
        w: 800,
        h: 450,
        cssW: 800,
        target: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
        markup: [{ id: 'm', kind: 'box', x: 0.5, y: 0.5, w: 0.2, h: 0.2 }],
      },
    },
    {
      id: 's2',
      title: 'Save',
      text: 'Click Save.',
      onlyIfAppears: false,
      observe: false,
      picture: null,
    },
  ],
};

const respond = (status: number, body: unknown) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  );

const at = (path: string) => window.history.replaceState(null, '', path);

beforeEach(() => at(`/tour-steps/${TOKEN}`));
afterEach(() => {
  vi.unstubAllGlobals();
  at('/');
});

describe('PublicTourPage', () => {
  it('draws the steps for a signed-out reader, with nothing that needs the app or the extension', async () => {
    const fetchMock = respond(200, tour);
    vi.stubGlobal('fetch', fetchMock);
    render(<PublicTourPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Post a grade' })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/tour-steps?t=${TOKEN}`,
      expect.objectContaining({ credentials: 'omit' })
    );
    expect(screen.getByText('Open the gradebook')).toBeInTheDocument();
    expect(screen.getByText('Only if it appears')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Picture of step 1' })
    ).toHaveAttribute('src', `/api/tour-steps?t=${TOKEN}&p=s1`);
    expect(
      screen.getByRole('button', { name: 'Walk through' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
    for (const staffOnly of [/get the extension/i, /^start/i, /sign in/i])
      expect(screen.queryByRole('button', { name: staffOnly })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows one plain not-found page for any refusal', async () => {
    vi.stubGlobal('fetch', respond(404, { error: 'not-found' }));
    render(<PublicTourPage />);
    expect(await screen.findByTestId('public-tour-missing')).toHaveTextContent(
      "This tour isn't available"
    );
  });

  it('never asks the server about an address that is not a token', () => {
    const fetchMock = respond(200, tour);
    vi.stubGlobal('fetch', fetchMock);
    at('/tour-steps/some-set-id');
    render(<PublicTourPage />);
    expect(screen.getByTestId('public-tour-missing')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an answer that is not the tour (the app shell) as not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<!doctype html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          })
      )
    );
    render(<PublicTourPage />);
    expect(
      await screen.findByTestId('public-tour-missing')
    ).toBeInTheDocument();
  });
});
