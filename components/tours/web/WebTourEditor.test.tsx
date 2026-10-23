import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { GuidedLearningSet } from '@/types';
import { DashboardContext } from '@/context/DashboardContextValue';
import { WebTourEditor } from './WebTourEditor';
import { targetsSignature } from './webStepReview';
import type { WebTourCheckProgress } from './extensionProtocol';

const storage = vi.hoisted(() => ({
  saveWebTourDraft: vi.fn((_set: GuidedLearningSet) => Promise.resolve()),
  loadWebTourDraft: vi.fn(),
  publishWebTour: vi.fn(
    (_id: string, _uid: string, _check?: (d: GuidedLearningSet) => void) =>
      Promise.resolve()
  ),
  deleteWebTourDraft: vi.fn(() => Promise.resolve()),
  setWebTourCheckRun: vi.fn(() => Promise.resolve()),
  uploadWebTourPicture: vi.fn(() =>
    Promise.resolve('web_tour_pictures/t1/abc.jpg')
  ),
  loadWebTourPicture: vi.fn(() => Promise.resolve(new ArrayBuffer(4))),
}));
vi.mock('@/components/tours/webTours', () => storage);

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}));
const ext = vi.hoisted(() => ({
  protocol: 2,
  onCheck: null as ((e: WebTourCheckProgress) => void) | null,
  startWebTour: vi.fn(() => Promise.resolve({ ok: true, tabId: 3 })),
}));
vi.mock('./extensionClient', async (orig) => ({
  ...(await orig<typeof import('./extensionClient')>()),
  startWebTour: ext.startWebTour,
  watchWebTourCheck: (
    _id: string,
    onEvent: (e: WebTourCheckProgress) => void
  ) => {
    ext.onCheck = onEvent;
    return () => undefined;
  },
  pingExtension: () =>
    Promise.resolve({
      kind: 'ready',
      protocol: ext.protocol,
      version: '1',
      profile: 'staff',
    }),
}));
vi.mock('@/components/tours/publishedTours', () => ({
  usePublishedTour: () => ({ loaded: true, tour: null }),
}));
vi.mock('./useCopyWebTourLink', () => ({
  useCopyWebTourLink: () => () => Promise.resolve(true),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));

const tour = (name: string): GuidedLearningSet => ({
  id: 't1',
  title: 'Schoology materials',
  imageUrls: [],
  mode: 'tour',
  surface: 'web',
  createdAt: 1,
  updatedAt: 1,
  steps: [
    {
      id: 's1',
      xPct: 50,
      yPct: 50,
      imageIndex: 0,
      interactionType: 'tooltip',
      label: 'Open the course',
      text: '',
      web: {
        urlPattern: 'https://orono.schoology.com/course/*/materials',
        action: 'click',
        locator: { role: 'link', name },
      },
    },
  ],
});

// A draft whose last check run found every step clearly.
const checked = (set: GuidedLearningSet): GuidedLearningSet => ({
  ...set,
  webTourChecked: {
    by: 'admin-1',
    at: 1,
    sig: targetsSignature(set),
    results: Object.fromEntries(set.steps.map((s) => [s.id, 'found'])),
  },
});

const renderEditor = (set: GuidedLearningSet) =>
  render(
    <DashboardContext.Provider
      value={
        {
          rosters: [{ students: [{ firstName: 'Alice', lastName: 'Nguyen' }] }],
        } as unknown as React.ContextType<typeof DashboardContext>
      }
    >
      <WebTourEditor initial={set} onClose={() => undefined} />
    </DashboardContext.Provider>
  );

const publishButton = () =>
  screen.getByRole('button', { name: 'Publish tour' });

const withPicture = (set: GuidedLearningSet): GuidedLearningSet => ({
  ...set,
  steps: set.steps.map((st) =>
    st.web
      ? {
          ...st,
          web: {
            ...st.web,
            picture: { path: 'web_tour_pictures/t1/a.jpg', w: 10, h: 10 },
          },
        }
      : st
  ),
});

beforeEach(() => {
  vi.clearAllMocks();
  ext.protocol = 2;
  ext.onCheck = null;
});

describe('WebTourEditor', () => {
  it('publishes a checked tour without pictures or student data straight away', async () => {
    renderEditor(checked(tour('Biology 7')));
    expect(publishButton()).toBeEnabled();
    fireEvent.click(publishButton());
    await waitFor(() => expect(storage.publishWebTour).toHaveBeenCalled());
    expect(screen.queryByText('Before you publish')).toBeNull();
  });

  it('hides student data at publish and lists what it hid', async () => {
    const set = tour('Biology 7');
    set.steps[0] = { ...set.steps[0], text: 'Ask Alice Nguyen' };
    renderEditor(checked(set));
    fireEvent.click(publishButton());
    expect(await screen.findByText('Student data hidden')).toBeInTheDocument();
    expect(screen.queryByText('Alice Nguyen')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(storage.publishWebTour).toHaveBeenCalled());
    const saved = storage.saveWebTourDraft.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(saved)).not.toContain('Alice');
  });

  it('asks for a new check when publish hides student data in a target', async () => {
    renderEditor(checked(tour('Alice Nguyen')));
    expect(screen.getByText('Alice Nguyen').tagName).toBe('MARK');
    fireEvent.click(publishButton());
    expect(
      await screen.findByText(
        'Student data was hidden in a step target. Check the tour again.'
      )
    ).toBeInTheDocument();
    expect(storage.publishWebTour).not.toHaveBeenCalled();
    expect(publishButton()).toBeDisabled();
  });

  it('asks about the pictures once, then publishes without asking again', async () => {
    renderEditor(checked(withPicture(tour('Biology 7'))));
    fireEvent.click(publishButton());
    expect(
      await screen.findByText('Anything private in these pictures?')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(storage.publishWebTour).toHaveBeenCalledTimes(1)
    );
    const saved = storage.saveWebTourDraft.mock.calls.at(-1)?.[0];
    expect(saved?.webPicturesChecked?.by).toBe('admin-1');
    await waitFor(() => expect(publishButton()).toBeEnabled());
    fireEvent.click(publishButton());
    await waitFor(() =>
      expect(storage.publishWebTour).toHaveBeenCalledTimes(2)
    );
    expect(
      screen.queryByText('Anything private in these pictures?')
    ).toBeNull();
  });

  it('goes to the blur tool from the picture check', async () => {
    renderEditor(checked(withPicture(tour('Biology 7'))));
    fireEvent.click(publishButton());
    await screen.findByText('Anything private in these pictures?');
    const blurs = screen.getAllByRole('button', { name: 'Blur' });
    fireEvent.click(blurs[blurs.length - 1]);
    expect(
      await screen.findByRole('button', { name: 'Apply blur' })
    ).toBeDisabled();
    expect(storage.publishWebTour).not.toHaveBeenCalled();
  });

  it('runs the gate on the draft publishing reads', async () => {
    renderEditor(checked(tour('Biology 7')));
    fireEvent.click(publishButton());
    await waitFor(() => expect(storage.publishWebTour).toHaveBeenCalled());
    const [id, uid, check] = storage.publishWebTour.mock
      .calls[0] as unknown as [string, string, (d: GuidedLearningSet) => void];
    expect([id, uid]).toEqual(['t1', 'admin-1']);
    // A draft that gained student data meanwhile is refused.
    expect(() => check(tour('Alice Nguyen'))).toThrow(/student-data/);
    // So is one that gained a picture nobody confirmed.
    expect(() => check(checked(withPicture(tour('Biology 7'))))).toThrow(
      /pictures-unchecked/
    );
    // And one whose targets changed since the check.
    expect(() => check(checked(tour('Biology 7')))).not.toThrow();
    const moved = checked(tour('Biology 7'));
    expect(() =>
      check({
        ...moved,
        steps: [
          ...moved.steps,
          ...tour('Grades').steps.map((s) => ({ ...s, id: 's2' })),
        ],
      })
    ).toThrow(/unchecked/);
  });

  it('blocks Publish until the tour is checked', () => {
    renderEditor(tour('Biology 7'));
    expect(publishButton()).toBeDisabled();
    expect(
      screen.getByText('Check the tour before publishing.')
    ).toBeInTheDocument();
  });

  it('keeps Check tour off on an extension without check mode', async () => {
    ext.protocol = 5;
    renderEditor(tour('Biology 7'));
    await waitFor(() => expect(ext.onCheck).toBeNull());
    expect(screen.getByRole('button', { name: 'Check tour' })).toBeDisabled();
  });

  it('checks the tour on the site and shows each step result', async () => {
    ext.protocol = 6;
    renderEditor(tour('Biology 7'));
    const button = screen.getByRole('button', { name: 'Check tour' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(ext.startWebTour).toHaveBeenCalled());
    const [handoff, url, index, runId] = ext.startWebTour.mock
      .calls[0] as unknown as [
      { steps: { id: string }[] },
      string,
      number,
      string,
    ];
    expect([url, index]).toEqual(['https://orono.schoology.com/', 0]);
    expect(runId).toEqual(expect.any(String));
    expect(handoff.steps.map((s) => s.id)).toEqual(['s1']);
    act(() =>
      ext.onCheck?.({
        type: 'web-tour/check-step',
        setId: 't1',
        runId,
        stepIndex: 0,
        stepId: 's1',
        result: 'weak',
      })
    );
    expect(screen.getByText('Weak match')).toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
    act(() =>
      ext.onCheck?.({
        type: 'web-tour/check-step',
        setId: 't1',
        runId,
        stepIndex: 0,
        stepId: 's1',
        result: 'found',
      })
    );
    expect(screen.getByText('Found')).toBeInTheDocument();
    expect(publishButton()).toBeEnabled();
    act(() =>
      ext.onCheck?.({
        type: 'web-tour/check-end',
        setId: 't1',
        runId,
        stepIndex: 0,
        done: true,
      })
    );
    expect(screen.getByText('Check finished.')).toBeInTheDocument();
    // Results save on their own, never as an edit that bumps the draft.
    expect(storage.setWebTourCheckRun).toHaveBeenLastCalledWith(
      't1',
      expect.objectContaining({ results: { s1: 'found' } })
    );
    expect(storage.saveWebTourDraft).not.toHaveBeenCalled();
    // Changing the step type changes its target, so the result expires.
    fireEvent.change(screen.getByLabelText('Step type'), {
      target: { value: 'observe' },
    });
    expect(screen.queryByText('Found')).toBeNull();
    expect(publishButton()).toBeDisabled();
  });

  it('offers Fix on site for a step found only by page position', async () => {
    ext.protocol = 3;
    const weak = tour('Biology 7');
    const web = weak.steps[0].web;
    if (!web) throw new Error('no web');
    weak.steps[0] = {
      ...weak.steps[0],
      web: { ...web, locator: { css: 'div > a' } },
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderEditor(weak);
    expect(screen.getByText('Needs checking')).toBeInTheDocument();
    const fix = screen.getByRole('button', { name: 'Fix on site' });
    await waitFor(() => expect(fix).toBeEnabled());
    fireEvent.click(fix);
    expect(open).toHaveBeenCalledWith(
      'https://orono.schoology.com/',
      '_blank',
      'noopener,noreferrer'
    );
    open.mockRestore();
  });

  it('keeps Fix on site off on an extension without it', () => {
    const weak = tour('Biology 7');
    const web = weak.steps[0].web;
    if (!web) throw new Error('no web');
    weak.steps[0] = { ...weak.steps[0], web: { ...web, locator: {} } };
    renderEditor(weak);
    expect(screen.getByRole('button', { name: 'Fix on site' })).toBeDisabled();
  });

  it('changes the step type', async () => {
    vi.useFakeTimers();
    try {
      renderEditor(tour('Biology 7'));
      fireEvent.change(screen.getByLabelText('Step type'), {
        target: { value: 'observe' },
      });
      await vi.advanceTimersByTimeAsync(1000);
      const saved = storage.saveWebTourDraft.mock.calls.at(-1)?.[0];
      expect(saved?.steps[0].web?.action).toBe('observe');
    } finally {
      vi.useRealTimers();
    }
  });

  it('never saves the draft again after Delete', async () => {
    vi.useFakeTimers();
    try {
      renderEditor(tour('Biology 7'));
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Renamed' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Delete web tour' }));
      await vi.advanceTimersByTimeAsync(2000);
      expect(storage.deleteWebTourDraft).toHaveBeenCalledWith('t1');
      expect(storage.saveWebTourDraft).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns when no roster is loaded', () => {
    render(
      <WebTourEditor initial={tour('Biology 7')} onClose={() => undefined} />
    );
    expect(screen.getByText(/No class rosters are loaded/)).toBeInTheDocument();
  });
});
