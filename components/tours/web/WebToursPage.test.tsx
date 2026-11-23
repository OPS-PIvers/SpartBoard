import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { WebToursPage } from './WebToursPage';

type Published = { set: unknown; publishedAt: number };

const who = vi.hoisted(() => ({ admin: true }));
vi.mock('./useTourAuthor', () => ({
  useTourAuthor: () => ({
    ready: true,
    admin: who.admin,
    author: true,
    passes: () => true,
  }),
}));
const h = vi.hoisted(() => ({
  onDrafts: null as ((sets: GuidedLearningSet[]) => void) | null,
  onDraftsError: null as (() => void) | null,
  create: vi.fn<() => Promise<unknown>>(),
  load: vi.fn<(id: string) => Promise<unknown>>(),
  copy: vi.fn<(id: string, title: string) => Promise<boolean>>(),
  published: new Map<string, Published>(),
  publicUrl: null as string | null,
  save: vi.fn<(set: GuidedLearningSet) => Promise<void>>(),
  remove: vi.fn<(id: string) => Promise<void>>(),
  confirm: vi.fn<() => Promise<boolean>>(),
  requestOn: vi.fn<(after?: (url: string) => void) => void>(),
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
  saveWebTourDraft: (set: GuidedLearningSet) => h.save(set),
  deleteWebTourDraft: (id: string) => h.remove(id),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => h.confirm() }),
}));
vi.mock('@/components/tours/tourRuns', () => ({
  loadTourRuns: () => Promise.resolve([]),
}));
vi.mock('./WebTourEditor', () => ({
  WebTourEditor: ({
    initial,
    onClose,
    initialStepId,
  }: {
    initial: GuidedLearningSet;
    onClose: () => void;
    initialStepId?: string;
  }) => (
    <div data-testid="editor">
      {initial.id}
      {initialStepId ? ` at ${initialStepId}` : ''}
      <button onClick={onClose}>close editor</button>
    </div>
  ),
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
    canTurnOn: true,
    requestOn: h.requestOn,
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
    h.save.mockReset();
    h.remove.mockReset().mockResolvedValue(undefined);
    h.confirm.mockReset().mockResolvedValue(true);
    h.requestOn.mockReset();
    window.history.replaceState(null, '', '/web-tours');
  });

  it('lists the drafts newest first with their publish state', () => {
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
    expect(screen.queryByRole('table')).toBeNull();
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

  it('shows the author and deletes a tour only after a yes', async () => {
    render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A', { authorName: 'Pat Lee' })]);
    expect(screen.getByTestId('web-tour-row')).toHaveTextContent('by Pat Lee');
    h.confirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Tour A' }));
    await act(() => Promise.resolve());
    expect(h.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Tour A' }));
    expect(await screen.findByText('Web tour deleted.')).toBeInTheDocument();
    expect(h.remove).toHaveBeenCalledWith('a');
  });

  it('hides Delete from an author on a tour someone else made', () => {
    who.admin = false;
    try {
      render(<WebToursPage />);
      showDrafts([tour('a', 'Tour A', { authorUid: 'someone-else' })]);
      expect(screen.getByRole('button', { name: 'Edit Tour A' })).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Delete Tour A' })
      ).toBeNull();
    } finally {
      who.admin = true;
    }
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

  it('shares the tour URL with a toast', async () => {
    h.copy.mockResolvedValue(true);
    h.published = new Map([
      ['a', { set: { surface: 'web', steps: [] }, publishedAt: 200 }],
    ]);
    render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A')]);
    fireEvent.click(screen.getByRole('button', { name: 'Share Tour A' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Tour URL/ }));
      await Promise.resolve();
    });
    expect(h.copy).toHaveBeenCalledWith('a', 'Tour A');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tour URL copied. Share it with someone at Orono Schools.'
    );
  });

  it('copies the steps URL while public, and asks to make it public first otherwise', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    h.published = new Map([
      ['a', { set: { surface: 'web', steps: [] }, publishedAt: 200 }],
    ]);
    h.publicUrl = 'https://x.test/tour-steps/tok';
    const view = render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A')]);
    fireEvent.click(screen.getByRole('button', { name: 'Share Tour A' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Steps URL/ }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith('https://x.test/tour-steps/tok');
    expect(screen.getByRole('status')).toHaveTextContent('Steps URL copied.');
    view.unmount();

    h.publicUrl = null;
    render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A')]);
    fireEvent.click(screen.getByRole('button', { name: 'Share Tour A' }));
    fireEvent.click(screen.getByRole('button', { name: /Steps URL/ }));
    expect(h.requestOn).toHaveBeenCalledTimes(1);
    await act(async () => {
      h.requestOn.mock.calls[0][0]?.('https://x.test/tour-steps/new');
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenLastCalledWith('https://x.test/tour-steps/new');
  });

  it('turns off Steps URL and HTML file until the tour is published', () => {
    render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A')]);
    fireEvent.click(screen.getByRole('button', { name: 'Share Tour A' }));
    for (const name of [/Steps URL/, /HTML file/]) {
      const item = screen.getByRole('button', { name });
      expect(item).toBeDisabled();
      expect(item).toHaveTextContent('Publish the tour first.');
    }
  });

  it('downloads the published steps as an HTML file', async () => {
    h.published = new Map([
      [
        'a',
        {
          set: {
            surface: 'web',
            steps: [{ id: 'm1', message: true, label: 'Welcome', text: 'Hi' }],
          },
          publishedAt: 200,
        },
      ],
    ]);
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A')]);
    fireEvent.click(screen.getByRole('button', { name: 'Share Tour A' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /HTML file/ }));
      await Promise.resolve();
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toHaveProperty('download', 'tour-a.html');
    const html = await blobs[0].text();
    expect(html).toContain('<h1>Tour A</h1>');
    expect(html).toContain('Step 1: Welcome');
    expect(screen.getByRole('status')).toHaveTextContent(
      'HTML file downloaded.'
    );
    click.mockRestore();
  });

  it('renames a tour in place from the stored draft; Escape cancels', async () => {
    h.save.mockResolvedValue(undefined);
    h.load.mockResolvedValue(tour('a', 'Tour A', { webGoal: 'newer edit' }));
    render(<WebToursPage />);
    showDrafts([tour('a', 'Tour A')]);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Tour A' }));
    const field = screen.getByRole('textbox', { name: 'Tour name' });
    fireEvent.change(field, { target: { value: 'Kept name' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(h.save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Tour A' }));
    const again = screen.getByRole('textbox', { name: 'Tour name' });
    fireEvent.change(again, { target: { value: '  New name ' } });
    await act(async () => {
      fireEvent.keyDown(again, { key: 'Enter' });
      await Promise.resolve();
    });
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.save.mock.calls[0][0]).toMatchObject({
      id: 'a',
      title: 'New name',
      webGoal: 'newer edit',
    });
    expect(screen.queryByRole('textbox', { name: 'Tour name' })).toBeNull();
  });

  it('searches by name or website and filters by state', () => {
    h.published = new Map([
      ['b', { set: { surface: 'web', steps: [] }, publishedAt: 200 }],
    ]);
    render(<WebToursPage />);
    showDrafts([
      tour('a', 'Gmail filters'),
      tour('b', 'Docs markdown', { updatedAt: 150 }),
    ]);
    const search = screen.getByRole('searchbox', { name: 'Search web tours' });
    fireEvent.change(search, { target: { value: 'gmail' } });
    const visible = () =>
      screen
        .getAllByTestId('web-tour-row')
        .filter((r) => !r.hidden)
        .map((r) => r.textContent ?? '');
    expect(visible()).toHaveLength(1);
    expect(visible()[0]).toContain('Gmail filters');
    fireEvent.change(search, { target: { value: 'example.com' } });
    expect(visible()).toHaveLength(2);
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'published' },
    });
    expect(visible()).toHaveLength(1);
    expect(visible()[0]).toContain('Docs markdown');
    fireEvent.change(search, { target: { value: 'gmail' } });
    expect(screen.getByText('No tours match.')).toBeInTheDocument();
  });

  it('shows Fix issues for a failed check and opens the editor on the first bad step', async () => {
    const set = tour('a', 'Tour A');
    const { targetsSignature } = await import('./webStepReview');
    const checked = {
      ...set,
      webTourChecked: {
        by: 'u',
        at: 1,
        sig: targetsSignature(set),
        results: { 'a-s1': 'none' as const },
      },
    };
    render(<WebToursPage />);
    showDrafts([checked]);
    fireEvent.click(screen.getByRole('button', { name: /Fix issues/ }));
    expect(await screen.findByTestId('editor')).toHaveTextContent('a at a-s1');
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
