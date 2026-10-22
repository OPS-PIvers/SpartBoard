import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { WebTourHealthSection } from './WebTourHealthSection';

const h = vi.hoisted(() => ({
  published: new Map<string, unknown>(),
  runs: new Map<string, unknown[]>(),
}));

vi.mock('@/components/tours/publishedTours', () => ({
  loadPublishedTour: (id: string) =>
    Promise.resolve(h.published.get(id) ?? null),
}));
vi.mock('@/components/tours/tourRuns', () => ({
  loadTourRuns: (id: string) => Promise.resolve(h.runs.get(id) ?? []),
}));
vi.mock('@/components/tours/webTours', () => ({
  listWebTourDrafts: () => Promise.resolve([]),
}));
vi.mock('@/hooks/useShortLinks', () => ({
  useCreateShortLink: () => ({ createShortLink: vi.fn() }),
}));

const set = {
  id: 'w1',
  title: 'Schoology updates',
  surface: 'web',
  steps: ['a', 'b', 'c'].map((id) => ({
    id,
    label: `Step ${id}`,
    web: {
      urlPattern: `https://app.schoology.com/${id}`,
      locator: {},
      action: 'click',
    },
  })),
} as unknown as GuidedLearningSet;

const withAuth = (enabled: boolean, ui: React.ReactElement) => (
  <AuthContext.Provider
    value={{ canAccessFeature: () => enabled } as unknown as AuthContextType}
  >
    {ui}
  </AuthContext.Provider>
);

describe('WebTourHealthSection', () => {
  it('renders nothing with the flag off or no auth provider', () => {
    const list = vi.fn(() => Promise.resolve([set]));
    const { container, unmount } = render(
      withAuth(false, <WebTourHealthSection listDrafts={list} />)
    );
    expect(container.innerHTML).toBe('');
    unmount();
    const bare = render(<WebTourHealthSection listDrafts={list} />);
    expect(bare.container.innerHTML).toBe('');
    expect(list).not.toHaveBeenCalled();
  });

  it('flags missed and weak steps from runs of the published version', async () => {
    h.published.set('w1', { set, publishedAt: 9, publishedBy: 'a' });
    const run = (over: object) => ({
      v: 9,
      startedAt: 0,
      furthest: 2,
      done: false,
      misses: [],
      surface: 'web',
      weak: [],
      ...over,
    });
    h.runs.set('w1', [
      run({ misses: ['a'], done: true }),
      run({ weak: ['b:css'] }),
      run({ v: 3, misses: ['c'] }),
    ]);
    const list = () => Promise.resolve([set]);
    render(withAuth(true, <WebTourHealthSection listDrafts={list} />));
    const tour = await screen.findByRole('region', {
      name: 'Schoology updates',
    });
    expect(within(tour).getByTestId('web-tour-state').textContent).toContain(
      'Not found'
    );
    const rows = within(tour).getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('Not found');
    expect(rows[1].textContent).toContain('Weak match');
    expect(rows[2].textContent).toContain('OK');
    expect(
      within(tour).getByRole('button', {
        name: 'Copy link to Schoology updates',
      })
    ).toBeTruthy();
  });

  it('shows an unpublished draft without runs or a link', async () => {
    h.published.delete('w1');
    render(
      withAuth(
        true,
        <WebTourHealthSection listDrafts={() => Promise.resolve([set])} />
      )
    );
    const tour = await screen.findByRole('region', {
      name: 'Schoology updates',
    });
    expect(tour.textContent).toContain('Not published');
    expect(within(tour).queryByRole('button')).toBeNull();
    expect(within(tour).queryByTestId('web-tour-state')).toBeNull();
    expect(tour.textContent).toContain('Not checked');
  });

  it('says when there are no web tours', async () => {
    render(
      withAuth(
        true,
        <WebTourHealthSection listDrafts={() => Promise.resolve([])} />
      )
    );
    expect(await screen.findByText('No web tours yet.')).toBeTruthy();
  });
});
