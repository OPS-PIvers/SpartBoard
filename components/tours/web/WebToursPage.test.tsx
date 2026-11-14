import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { WebToursPage } from './WebToursPage';

type Published = { set: unknown; publishedAt: number };

const h = vi.hoisted(() => ({
  onDrafts: null as ((sets: GuidedLearningSet[]) => void) | null,
  onDraftsError: null as (() => void) | null,
  create: vi.fn<() => Promise<unknown>>(),
  load: vi.fn<(id: string) => Promise<unknown>>(),
  copy: vi.fn<(id: string, title: string) => Promise<boolean>>(),
  published: new Map<string, Published>(),
  publicUrl: null as string | null,
}));

vi.mock('@/components/tours/webTours', () => ({
  watchWebTourDrafts: (
    onChange: (sets: GuidedLearningSet[]) => void,
    onError: () => void
  ) => {
    h.onDrafts = onChange;
    h.onDraftsError = onError;
    return () => undefined;
  },
  createWebTourDraft: () => h.create(),
  loadWebTourDraft: (id: string) => h.load(id),
}));
vi.mock('./WebTourEditor', () => ({
  WebTourEditor: ({
    initial,
    onClose,
  }: {
    initial: GuidedLearningSet;
    onClose: () => void;
  }) => (
    <div data-testid="editor">
      {initial.id}
      <button onClick={onClose}>close editor</button>
    </div>
  ),
}));
vi.mock('./WebTourHealthSection', () => ({
  WebTourHealthSection: () => <div data-testid="health" />,
}));
vi.mock('./WebTourEditorRosters', () => ({
  WebTourEditorRosters: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('./useCopyWebTourLink', () => ({
  useCopyWebTourLink: () => h.copy,
}));
vi.mock('./useTourCounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useTourCounts')>()),
  useTourCounts: (_id: string, enabled: boolean) =>
    enabled ? { plays: 12, finished: 1, linkViews: 0 } : null,
}));
vi.mock('@/components/tours/publishedTours', () => ({
  usePublishedTour: (id: string) => ({
    loaded: true,
    tour: h.published.get(id) ?? null,
  }),
}));
vi.mock('@/components/tours/publicLink/usePublicLinkControls', () => ({
  usePublicLinkControls: () => ({
    footer: null,
    dialog: null,
    statusNote: null,
    publicUrl: h.publicUrl,
    status: h.publicUrl ? { kind: 'on', url: h.publicUrl } : { kind: 'off' },
  }),
}));

const tour = (
  id: string,
  title: string,
  extra: Partial<GuidedLearningSet> = {}
): GuidedLearningSet =>
  ({
    id,
    title,
    surface: 'web',
    steps: [
      {
        id: `${id}-s1`,
        web: { urlPattern: 'https://example.com/*' },
      },
    ],
    updatedAt: 100,
    ...extra,
  }) as unknown as GuidedLearningSet;

const showDrafts = (sets: GuidedLearningSet[]) => act(() => h.onDrafts?.(sets));

describe('WebToursPage', () => {
  beforeEach(() => {
    h.onDrafts = null;
    h.onDraftsError = null;
    h.create.mockReset();
    h.load.mockReset();
    h.copy.mockReset();
    h.published = new Map();
    h.publicUrl = null;
    window.history.replaceState(null, '', '/web-tours');
  });

  it('lists the drafts newest first with their publish state, then the health section', () => {
    h.published = new Map([
      ['b', { set: { surface: 'web', steps: [] }, publishedAt: 200 }],
    ]);
    render(<WebToursPage />);
    showDrafts([
      tour('a', 'Older tour', { updatedAt: 1 }),
      tour('b', 'Newer tour', { updatedAt: 150 }),
    ]);
    const rows = screen.getAllByTestId('web-tour-row');
    expect(rows[0]).toHaveTextContent('Newer tour');
    expect(rows[0]).toHaveTextContent('Published');
    expect(rows[0]).toHaveTextContent('1 step · example.com');
    expect(rows[0]).toHaveTextContent('12 views · 1 finished');
    expect(rows[0]).not.toHaveTextContent('link view');
    expect(rows[1]).toHaveTextContent('Draft');
    expect(rows[1]).not.toHaveTextContent('views');
    expect(
      screen.getByRole('button', { name: 'Play Older tour' })
    ).toBeDisabled();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Play Newer tour' }));
    expect(open).toHaveBeenCalledWith(
      `${window.location.origin}/tour/b`,
      '_blank',
      'noopener,noreferrer'
    );
    open.mockRestore();
    expect(screen.getByTestId('health')).toBeInTheDocument();
  });

  it('shows an empty state and a load failure', () => {
    render(<WebToursPage />);
    showDrafts([]);
    expect(screen.getByText('No web tours yet')).toBeInTheDocument();
    act(() => h.onDraftsError?.());
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Web tours couldn't load."
    );
  });

  it('creates a draft and opens it in the editor', async () => {
    h.create.mockResolvedValue(tour('new1', ''));
    render(<WebToursPage />);
    showDrafts([]);
    fireEvent.click(screen.getByRole('button', { name: /New web tour/ }));
    expect(await screen.findByTestId('editor')).toHaveTextContent('new1');
    fireEvent.click(screen.getByText('close editor'));
    expect(screen.queryByTestId('editor')).toBeNull();
  });

  it('opens the editor from Edit and from Check tour', async () => {
    render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A')]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Tour A' }));
    expect(await screen.findByTestId('editor')).toHaveTextContent('a');
    fireEvent.click(screen.getByText('close editor'));
    fireEvent.click(screen.getByRole('button', { name: 'Check Tour A' }));
    expect(await screen.findByTestId('editor')).toHaveTextContent('a');
  });

  it('copies the staff link, or the public link while it is on', async () => {
    h.copy.mockResolvedValue(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const view = render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A')]);
    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy link for Tour A' })
      );
    });
    expect(h.copy).toHaveBeenCalledWith('a', 'Tour A');
    expect(await screen.findByText('Link copied')).toBeInTheDocument();

    h.publicUrl = 'https://x.test/tour-steps/tok';
    view.unmount();
    render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A')]);
    expect(screen.getByText('Public link on')).toBeInTheDocument();
    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy link for Tour A' })
      );
    });
    expect(writeText).toHaveBeenCalledWith('https://x.test/tour-steps/tok');
    expect(h.copy).toHaveBeenCalledTimes(1);
  });

  it('opens the tour named in ?edit-web-tour and takes it off the address', async () => {
    window.history.replaceState(null, '', '/web-tours?edit-web-tour=abc_1');
    h.load.mockResolvedValue(tour('abc_1', 'Linked'));
    render(<WebToursPage />);
    expect(await screen.findByTestId('editor')).toHaveTextContent('abc_1');
    expect(h.load).toHaveBeenCalledWith('abc_1');
    expect(window.location.search).toBe('');
  });

  it('ignores a malformed ?edit-web-tour id', () => {
    window.history.replaceState(null, '', '/web-tours?edit-web-tour=a%2Fb');
    render(<WebToursPage />);
    expect(h.load).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });
});
