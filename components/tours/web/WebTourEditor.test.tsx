import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { GuidedLearningSet } from '@/types';
import { DashboardContext } from '@/context/DashboardContextValue';
import { WebTourEditor } from './WebTourEditor';
import { picturesSignature, targetsSignature } from './webStepReview';
import type { WebTourCheckEvent } from './extensionClient';
import type { TourRun } from '@/components/tours/tourRuns';
import type { RecordedWebStep } from './recorderProtocol';

const storage = vi.hoisted(() => ({
  WEB_TOUR_PICTURE_MAX_BYTES: 5 * 1024 * 1024,
  saveWebTourDraft: vi.fn((_set: GuidedLearningSet) => Promise.resolve()),
  loadWebTourDraft: vi.fn(),
  publishWebTour: vi.fn(
    (
      _id: string,
      _uid: string,
      _check?: (d: GuidedLearningSet) => void,
      _keep?: Iterable<string>
    ) => Promise.resolve()
  ),
  deleteWebTourDraft: vi.fn(() => Promise.resolve()),
  setWebTourCheckRun: vi.fn(() => Promise.resolve()),
  setWebTourFixes: vi.fn((_set: GuidedLearningSet) => Promise.resolve()),
  uploadWebTourPicture: vi.fn(() =>
    Promise.resolve('web_tour_pictures/t1/abc.jpg')
  ),
  loadWebTourPicture: vi.fn(() => Promise.resolve(new ArrayBuffer(4))),
  sweepWebTourPictures: vi.fn(
    (
      _id: string,
      _opts?: { keep?: Iterable<string>; replaced?: Iterable<string> }
    ) => Promise.resolve([] as string[])
  ),
  duplicateWebTourDraft: vi.fn((set: GuidedLearningSet) =>
    Promise.resolve({ ...set, id: 't2', title: `${set.title} (Copy)` })
  ),
}));
vi.mock('@/components/tours/webTours', () => storage);
vi.mock(
  '@/components/widgets/GuidedLearning/utils/redactImage',
  async (orig) => ({
    ...(await orig<
      typeof import('@/components/widgets/GuidedLearning/utils/redactImage')
    >()),
    redactImage: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
  })
);

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}));
const ext = vi.hoisted(() => ({
  protocol: 2,
  onCheck: null as ((e: WebTourCheckEvent) => void) | null,
  startWebTour: vi.fn(() => Promise.resolve({ ok: true, tabId: 3 })),
}));
vi.mock('./extensionClient', async (orig) => ({
  ...(await orig<typeof import('./extensionClient')>()),
  startWebTour: ext.startWebTour,
  watchWebTourCheck: (_id: string, onEvent: (e: WebTourCheckEvent) => void) => {
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
const live = vi.hoisted(() => ({
  tour: null as null | { set: unknown; publishedAt: number },
  runs: [] as unknown[],
}));
vi.mock('@/components/tours/publishedTours', () => ({
  usePublishedTour: () => ({ loaded: true, tour: live.tour }),
}));
vi.mock('@/components/tours/tourRuns', () => ({
  loadTourRuns: () => Promise.resolve(live.runs),
}));
vi.mock('./useCopyWebTourLink', () => ({
  useCopyWebTourLink: () => () => Promise.resolve(true),
}));

const rec = vi.hoisted(() => ({
  link: 'off',
  connect: vi.fn(),
  disconnect: vi.fn(),
  repick: vi.fn(),
  onStep: null as null | ((step: RecordedWebStep) => Promise<void>),
  onRepicked: null as null | ((step: RecordedWebStep) => Promise<void>),
}));
vi.mock('./useWebTourRecorder', () => ({
  useWebTourRecorder: (opts: {
    onStep: (step: RecordedWebStep) => Promise<void>;
    onRepicked?: (step: RecordedWebStep) => Promise<void>;
  }) => {
    rec.onStep = opts.onStep;
    rec.onRepicked = opts.onRepicked ?? null;
    return {
      link: rec.link,
      connect: rec.connect,
      disconnect: rec.disconnect,
      repick: rec.repick,
    };
  },
}));

vi.mock('./pictureFiles', async (orig) => ({
  ...(await orig<typeof import('./pictureFiles')>()),
  cropImage: vi.fn(() =>
    Promise.resolve({
      blob: new Blob(['c'], { type: 'image/jpeg' }),
      w: 40,
      h: 20,
    })
  ),
  imageSize: vi.fn(() => Promise.resolve({ w: 300, h: 200 })),
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

const main = () => screen.getByTestId('tour-shell-main');
const publishButton = () => {
  expect(main()).toHaveAttribute('data-state', 'publish');
  return main();
};
const openMore = () => fireEvent.click(screen.getByTestId('tour-step-more'));
const menuItem = (name: string) => {
  fireEvent.click(screen.getByTestId('tour-shell-menu'));
  return screen.getByRole('menuitem', { name });
};
const statusLine = () => screen.getByTestId('tour-shell-status');

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
  live.tour = null;
  live.runs = [];
  rec.link = 'off';
  rec.onStep = null;
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
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Before you publish' })
      ).getByRole('button', { name: 'Publish' })
    );
    await waitFor(() => expect(storage.publishWebTour).toHaveBeenCalled());
    const saved = storage.saveWebTourDraft.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(saved)).not.toContain('Alice');
  });

  it('asks for a new check when publish hides student data in a target', async () => {
    renderEditor(checked(tour('Alice Nguyen')));
    openMore();
    for (const hit of screen.getAllByText('Alice Nguyen'))
      expect(hit.tagName).toBe('MARK');
    fireEvent.click(publishButton());
    expect(
      await screen.findByText(
        'Student data was hidden in a step target. Check the tour again.'
      )
    ).toBeInTheDocument();
    expect(storage.publishWebTour).not.toHaveBeenCalled();
    expect(main()).toHaveAttribute('data-state', 'check');
  });

  it('asks about the pictures once, then publishes without asking again', async () => {
    renderEditor(checked(withPicture(tour('Biology 7'))));
    fireEvent.click(publishButton());
    expect(
      await screen.findByText('Anything private in these pictures?')
    ).toBeInTheDocument();
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Before you publish' })
      ).getByRole('button', { name: 'Publish' })
    );
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

  it('asks for a check before Publish, and says why it cannot run here', async () => {
    renderEditor(tour('Biology 7'));
    expect(main()).toHaveAttribute('data-state', 'check');
    expect(main()).toBeDisabled();
    await waitFor(() =>
      expect(statusLine()).toHaveTextContent(
        'Checking needs the SpartBoard extension'
      )
    );
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
    expect(screen.getAllByText('Weak match').length).toBeGreaterThan(0);
    expect(main()).toHaveAttribute('data-state', 'check');
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
    expect(screen.getAllByText('Found').length).toBeGreaterThan(0);
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
    expect(main()).toHaveAttribute('data-state', 'check');
  });

  it('saves a check run fix, and using it replaces the target and expires the check (C14)', async () => {
    ext.protocol = 7;
    renderEditor(tour('Biology 7'));
    const button = screen.getByRole('button', { name: 'Check tour' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(ext.startWebTour).toHaveBeenCalled());
    const runId = (ext.startWebTour.mock.calls[0] as unknown as string[])[3];
    act(() => {
      ext.onCheck?.({
        type: 'web-tour/check-step',
        setId: 't1',
        runId,
        stepIndex: 0,
        stepId: 's1',
        result: 'weak',
      });
      ext.onCheck?.({
        type: 'web-tour/suggest',
        setId: 't1',
        runId,
        stepIndex: 0,
        stepId: 's1',
        locator: { role: 'link', name: 'Biology 7 (2026)' },
      });
    });
    const panel = screen.getByRole('region', { name: 'Suggested fix' });
    expect(panel).toHaveTextContent('Biology 7 (2026)');
    expect(storage.setWebTourFixes).toHaveBeenCalled();
    expect(storage.saveWebTourDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use this fix' }));
    expect(screen.queryByRole('region', { name: 'Suggested fix' })).toBeNull();
    expect(main()).toHaveAttribute('data-state', 'check');
    await waitFor(() => expect(storage.saveWebTourDraft).toHaveBeenCalled());
    const saved = storage.saveWebTourDraft.mock.calls.at(-1)?.[0];
    expect(saved?.steps[0].web?.locator).toEqual({
      role: 'link',
      name: 'Biology 7 (2026)',
    });
  });

  it('drops a check fix once a later result finds the step clearly', async () => {
    ext.protocol = 7;
    renderEditor(tour('Biology 7'));
    const button = screen.getByRole('button', { name: 'Check tour' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(ext.startWebTour).toHaveBeenCalled());
    const runId = (ext.startWebTour.mock.calls[0] as unknown as string[])[3];
    const step = (result: 'weak' | 'found') =>
      ext.onCheck?.({
        type: 'web-tour/check-step',
        setId: 't1',
        runId,
        stepIndex: 0,
        stepId: 's1',
        result,
      });
    act(() => {
      step('weak');
      ext.onCheck?.({
        type: 'web-tour/suggest',
        setId: 't1',
        runId,
        stepIndex: 0,
        stepId: 's1',
        locator: { role: 'link', name: 'Biology 7 (2026)' },
      });
    });
    expect(screen.getByRole('region', { name: 'Suggested fix' })).toBeTruthy();
    act(() => step('found'));
    expect(screen.queryByRole('region', { name: 'Suggested fix' })).toBeNull();
    expect(storage.setWebTourFixes).toHaveBeenLastCalledWith(
      expect.objectContaining({ webSuggestions: {} })
    );
  });

  it("never shows a student's name or page title from a teacher's run (C15)", async () => {
    const set = tour('Biology 7');
    const run: TourRun = {
      v: 9,
      startedAt: 3,
      furthest: 0,
      done: false,
      misses: ['s1'],
      surface: 'web',
      weak: [],
      fixes: {
        s1: {
          role: 'link',
          name: 'Jane Smith',
          pageTitle: 'Smith, Jane - Grades',
          css: 'tr.student > a',
        },
      },
    };
    live.tour = { set, publishedAt: 9 };
    live.runs = [run, { ...run, startedAt: 4 }];
    renderEditor(set);
    const panel = await screen.findByRole('region', { name: 'Suggested fix' });
    expect(panel).toHaveTextContent('tr.student > a');
    expect(document.body.textContent).not.toMatch(/Jane|Smith|Grades/);
  });

  it('shows a fix from teacher runs only once two agree, and dismisses it (C16)', async () => {
    const set = tour('Biology 7');
    const run = (uid: string): TourRun => ({
      v: 9,
      startedAt: uid === 'u1' ? 3 : 4,
      furthest: 0,
      done: false,
      misses: ['s1'],
      surface: 'web',
      weak: [],
      fixes: { s1: { role: 'link', name: 'Biology 7', css: 'a.course' } },
    });
    live.tour = { set, publishedAt: 9 };
    live.runs = [run('u1')];
    const { unmount } = renderEditor(set);
    await act(() => Promise.resolve());
    expect(screen.queryByRole('region', { name: 'Suggested fix' })).toBeNull();
    unmount();
    live.runs = [run('u1'), run('u2')];
    renderEditor(set);
    expect(
      await screen.findByRole('region', { name: 'Suggested fix' })
    ).toHaveTextContent('a.course');
    expect(screen.getAllByText('Suggested fix').length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Suggested fix' })).toBeNull();
    expect(storage.setWebTourFixes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        webFixDismissed: { s1: expect.any(String) as unknown },
      })
    );
    expect(storage.saveWebTourDraft).not.toHaveBeenCalled();
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
    expect(
      screen.getByText('This step may not find its target on the site.')
    ).toBeInTheDocument();
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

  it('drops Needs checking once Check tour found a page-position step', () => {
    const weak = tour('Biology 7');
    const web = weak.steps[0].web;
    if (!web) throw new Error('no web');
    weak.steps[0] = {
      ...weak.steps[0],
      web: { ...web, locator: { css: 'div > a' } },
    };
    renderEditor(checked(weak));
    expect(screen.queryByText('Needs checking')).toBeNull();
    expect(
      screen.queryByText('This step may not find its target on the site.')
    ).toBeNull();
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
      fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Renamed' },
      });
      fireEvent.click(menuItem('Delete web tour'));
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

  it('previews the step on its picture with the real ring, tip and bar', async () => {
    const set = withPicture(checked(tour('Biology 7')));
    const web = set.steps[0].web;
    if (!web) throw new Error('no web');
    set.steps[0] = {
      ...set.steps[0],
      text: 'Opens the course page.',
      web: {
        ...web,
        picture: {
          path: 'web_tour_pictures/t1/a.jpg',
          w: 1280,
          h: 900,
          target: { x: 0.4, y: 0.45, w: 0.2, h: 0.1 },
          cssW: 640,
        },
      },
    };
    renderEditor(set);
    const stage = screen.getByTestId('web-stage');
    await waitFor(() =>
      expect(within(stage).getByTestId('tour-spotlight-ring')).toBeTruthy()
    );
    // Drawn at the picture's CSS size, so the chrome keeps its real proportions.
    expect(within(stage).getByTestId('web-stage-frame')).toHaveStyle({
      width: '640px',
      height: '450px',
    });
    // The ring sits on the stored place, padded as playback pads it.
    const ring = within(stage).getByTestId('tour-spotlight-ring');
    expect(ring.getAttribute('x')).toBe(String(0.4 * 640 - 6));
    expect(ring.getAttribute('width')).toBe(String(0.2 * 640 + 12));
    expect(within(stage).queryByTestId('web-stage-no-ring')).toBeNull();
    expect(within(stage).getByTestId('tour-step-title')).toHaveTextContent(
      'Open the course'
    );
    expect(within(stage).getByText('Opens the course page.')).toBeTruthy();
    // The bar sits above the picture, never over it; the ring and tip stay on it.
    const frame = within(stage).getByTestId('web-stage-frame');
    expect(within(stage).getByTestId('tour-bar')).toBeTruthy();
    expect(within(frame).queryByTestId('tour-bar')).toBeNull();
    expect(within(frame).getByTestId('tour-callout')).toBeTruthy();
  });

  it('draws no ring and says why when an older step cannot be placed', async () => {
    const set = withPicture(checked(tour('Biology 7')));
    const web = set.steps[0].web;
    if (!web) throw new Error('no web');
    set.steps[0] = {
      ...set.steps[0],
      web: {
        ...web,
        locator: { ...web.locator, box: { x: 0.4, y: 0.4, w: 0.1, h: 0.05 } },
      },
    };
    renderEditor(set);
    const stage = screen.getByTestId('web-stage');
    expect(
      await within(stage).findByTestId('web-stage-no-ring')
    ).toHaveTextContent('Retake or fix this step on the site');
    expect(within(stage).queryByTestId('tour-spotlight-ring')).toBeNull();
    // With no ring the tip docks under the picture, so the whole picture shows.
    const dock = within(stage).getByTestId('web-stage-dock');
    expect(within(dock).getByTestId('tour-callout')).toBeTruthy();
    expect(
      within(within(stage).getByTestId('web-stage-frame')).queryByTestId(
        'tour-callout'
      )
    ).toBeNull();
  });

  it('shows Play only once the tour is published', () => {
    renderEditor(checked(tour('Biology 7')));
    expect(screen.queryByTestId('tour-shell-play')).toBeNull();
  });

  // Blurs the only step's picture (a.jpg becomes abc.jpg), then publishes.
  const blurAndPublish = async () => {
    const view = renderEditor(withPicture(checked(tour('Biology 7'))));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select picture' })
    );
    fireEvent.click(
      within(screen.getByRole('toolbar', { name: 'Picture tools' })).getByRole(
        'button',
        { name: 'Blur' }
      )
    );
    await waitFor(() =>
      expect(screen.getByTestId('web-stage-blur').firstChild).toBeTruthy()
    );
    const area = screen.getByRole('img', { name: /Drag across what to blur/ });
    area.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    area.setPointerCapture = () => undefined;
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(area, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Apply blur' }));
    await waitFor(() =>
      expect(storage.uploadWebTourPicture).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(
        storage.saveWebTourDraft.mock.calls.at(-1)?.[0].steps[0].web?.picture
          ?.path
      ).toBe('web_tour_pictures/t1/abc.jpg')
    );
    fireEvent.click(main());
    await screen.findByText('Anything private in these pictures?');
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Before you publish' })
      ).getByRole('button', { name: 'Publish' })
    );
    await waitFor(() => expect(storage.publishWebTour).toHaveBeenCalled());
    return view;
  };

  const sweepCall = (i: number) =>
    storage.sweepWebTourPictures.mock.calls[i] as [
      string,
      { keep?: Iterable<string>; replaced?: Iterable<string> },
    ];

  it('keeps a blurred-over picture through publish, so undo can bring it back', async () => {
    await blurAndPublish();
    const keep = [...(storage.publishWebTour.mock.calls[0][3] ?? [])];
    expect(keep).toContain('web_tour_pictures/t1/a.jpg');
    await waitFor(() =>
      expect(storage.sweepWebTourPictures).toHaveBeenCalledTimes(2)
    );
    expect([...(sweepCall(1)[1].keep ?? [])]).toContain(
      'web_tour_pictures/t1/a.jpg'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(
        storage.saveWebTourDraft.mock.calls.at(-1)?.[0].steps[0].web?.picture
          ?.path
      ).toBe('web_tour_pictures/t1/a.jpg')
    );
  });

  it('deletes the blurred-over original once the editor closes', async () => {
    const { unmount } = await blurAndPublish();
    unmount();
    await waitFor(() =>
      expect(storage.sweepWebTourPictures).toHaveBeenCalledTimes(3)
    );
    const [id, opts] = sweepCall(2);
    expect(id).toBe('t1');
    expect([...(opts.replaced ?? [])]).toContain('web_tour_pictures/t1/a.jpg');
    expect([...(opts.keep ?? [])]).not.toContain('web_tour_pictures/t1/a.jpg');
    expect([...(opts.keep ?? [])]).toContain('web_tour_pictures/t1/abc.jpg');
  });

  it('sweeps pictures an earlier session left behind when it opens', () => {
    renderEditor(withPicture(checked(tour('Biology 7'))));
    expect(storage.sweepWebTourPictures).toHaveBeenCalledWith('t1', {
      keep: ['web_tour_pictures/t1/a.jpg'],
    });
  });

  it('shows picture tools only once the stage picture is selected', async () => {
    renderEditor(withPicture(checked(tour('Biology 7'))));
    expect(screen.queryByRole('toolbar', { name: 'Picture tools' })).toBeNull();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select picture' })
    );
    const tools = screen.getByRole('toolbar', { name: 'Picture tools' });
    fireEvent.click(within(tools).getByRole('button', { name: 'Blur' }));
    expect(
      await screen.findByRole('button', { name: 'Apply blur' })
    ).toBeDisabled();
  });

  it('keeps the recorded clues and the note for Claude under More', () => {
    renderEditor(checked(tour('Biology 7')));
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Tip')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note for Claude')).toBeNull();
    expect(screen.queryByText('How the step finds its target')).toBeNull();
    openMore();
    expect(screen.getByLabelText('Note for Claude')).toBeInTheDocument();
    expect(
      screen.getByText('How the step finds its target')
    ).toBeInTheDocument();
  });

  it('undoes and redoes edits', () => {
    renderEditor(checked(tour('Biology 7')));
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Open Biology' },
    });
    expect(screen.getByLabelText('Title')).toHaveValue('Open Biology');
    fireEvent.click(undo);
    expect(screen.getByLabelText('Title')).toHaveValue('Open the course');
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Open Biology');
  });

  it('keeps a check result through an undo', async () => {
    ext.protocol = 6;
    renderEditor(tour('Biology 7'));
    fireEvent.change(screen.getByLabelText('Tip'), {
      target: { value: 'Opens it.' },
    });
    const button = screen.getByRole('button', { name: 'Check tour' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(ext.startWebTour).toHaveBeenCalled());
    const runId = (ext.startWebTour.mock.calls[0] as unknown as string[])[3];
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
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Tip')).toHaveValue('');
    expect(main()).toHaveAttribute('data-state', 'publish');
  });

  it('adds a step after the selected one and selects it', () => {
    const set = checked(tour('Biology 7'));
    set.steps.push({ ...set.steps[0], id: 's2', label: 'Second' });
    renderEditor(set);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    const rows = screen.getAllByTestId('tour-editor-step');
    expect(rows[0]).toHaveAttribute('data-step-id', 's1');
    expect(rows[1]).toHaveAttribute('aria-current', 'step');
    expect(rows[2]).toHaveAttribute('data-step-id', 's2');
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('records from the selected step, keeping the recorded order', async () => {
    const set = checked(tour('Biology 7'));
    set.steps.push({ ...set.steps[0], id: 's2', label: 'Second' });
    renderEditor(set);
    fireEvent.click(screen.getByRole('button', { name: 'Record from here' }));
    expect(rec.connect).toHaveBeenCalled();
    const recorded = (id: string): RecordedWebStep => ({
      id,
      urlPattern: 'https://orono.schoology.com/home',
      action: 'click',
      locator: { role: 'button', name: id },
    });
    await act(() => rec.onStep?.(recorded('r1')) ?? Promise.resolve());
    await act(() => rec.onStep?.(recorded('r2')) ?? Promise.resolve());
    const saved = storage.saveWebTourDraft.mock.calls.at(-1)?.[0];
    expect(saved?.steps.map((st) => st.id)).toEqual(['s1', 'r1', 'r2', 's2']);
    expect(screen.getAllByTestId('tour-editor-step')[2]).toHaveAttribute(
      'aria-current',
      'step'
    );
  });

  it('moves the main button from Write text to Check tour', () => {
    const set = tour('Biology 7');
    set.steps[0] = { ...set.steps[0], label: '' };
    renderEditor(set);
    expect(main()).toHaveAttribute('data-state', 'write');
    expect(main()).toHaveAttribute(
      'data-tour',
      'web-tour-editor.write-with-claude'
    );
    expect(statusLine()).toHaveTextContent('1 step needs text');
    expect(screen.getByText('Needs text')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Open the course' },
    });
    expect(main()).toHaveAttribute('data-state', 'check');
    expect(main()).toHaveAttribute('data-tour', 'web-tour-editor.check');
  });

  it('copies the link and duplicates from the menu', async () => {
    renderEditor(checked(tour('Biology 7')));
    fireEvent.click(menuItem('Copy link'));
    expect(await screen.findByText('Link copied.')).toBeInTheDocument();
    fireEvent.click(menuItem('Duplicate'));
    await waitFor(() =>
      expect(storage.duplicateWebTourDraft).toHaveBeenCalled()
    );
    expect(
      await screen.findByRole('heading', { name: 'Schoology materials (Copy)' })
    ).toBeInTheDocument();
  });
});

// A recorded step with its capture kept: the picture is the middle half of the screen.
const captured = (set: GuidedLearningSet): GuidedLearningSet => ({
  ...set,
  steps: set.steps.map((st) =>
    st.web
      ? {
          ...st,
          web: {
            ...st.web,
            picture: {
              path: 'web_tour_pictures/t1/a.jpg',
              w: 800,
              h: 400,
              cssW: 640,
              target: { x: 0.45, y: 0.45, w: 0.1, h: 0.1 },
              original: {
                path: 'web_tour_pictures/t1/full.jpg',
                w: 1600,
                h: 800,
                crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
              },
            },
          },
        }
      : st
  ),
});

const lastSaved = () => storage.saveWebTourDraft.mock.calls.at(-1)?.[0];
const savedPicture = () => lastSaved()?.steps[0].web?.picture;

const openTool = async (name: string) => {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Select picture' })
  );
  fireEvent.click(
    within(screen.getByRole('toolbar', { name: 'Picture tools' })).getByRole(
      'button',
      { name }
    )
  );
};

const sized = (el: Element, w = 100, h = 100) => {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h }) as DOMRect;
  (el as Element & { setPointerCapture: () => void }).setPointerCapture = () =>
    undefined;
};

describe('WebTourEditor picture tools (E5)', () => {
  beforeEach(() => {
    let n = 0;
    storage.uploadWebTourPicture.mockImplementation(() =>
      Promise.resolve(`web_tour_pictures/t1/up${++n}.jpg`)
    );
  });

  it('shows every tool only once the picture is selected', async () => {
    renderEditor(checked(captured(tour('Biology 7'))));
    expect(screen.queryByRole('button', { name: 'Crop' })).toBeNull();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select picture' })
    );
    const tools = screen.getByRole('toolbar', { name: 'Picture tools' });
    for (const name of [
      'Crop',
      'Mark up',
      'Blur',
      'Retake',
      'Replace',
      'Remove picture',
    ])
      expect(within(tools).getByRole('button', { name })).toBeTruthy();
  });

  it('re-crops from the capture and keeps the ring on the same spot', async () => {
    renderEditor(checked(captured(tour('Biology 7'))));
    await openTool('Crop');
    expect(
      screen.getByText(/The whole screen from the recording is shown/)
    ).toBeInTheDocument();
    const area = screen.getByRole('group', {
      name: 'Drag the crop or its corners',
    });
    sized(area);
    // Drag the bottom-right corner out to the screen's corner.
    fireEvent.pointerDown(screen.getByTestId('web-crop-handle-se'), {
      clientX: 75,
      clientY: 75,
      pointerId: 1,
    });
    fireEvent.pointerMove(area, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(area, { clientX: 100, clientY: 100, pointerId: 1 });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply crop' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));
    await waitFor(() =>
      expect(savedPicture()?.path).toBe('web_tour_pictures/t1/up1.jpg')
    );
    const pic = savedPicture();
    expect(pic?.original?.crop).toEqual({ x: 0.25, y: 0.25, w: 0.75, h: 0.75 });
    // The target's screen spot: 0.25 + 0.45 * 0.5 = 0.475, now (0.475 - 0.25) / 0.75.
    expect(pic?.target?.x).toBeCloseTo(0.3, 6);
    expect(pic?.target?.w).toBeCloseTo(0.05 / 0.75, 6);
  });

  it('explains that an older step can only crop tighter', async () => {
    renderEditor(checked(withPicture(tour('Biology 7'))));
    await openTool('Crop');
    expect(screen.getByText(/can only be cropped tighter/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply crop' })).toBeDisabled();
  });

  it('blurs the capture too, so a later re-crop never shows what was hidden', async () => {
    renderEditor(checked(captured(tour('Biology 7'))));
    await openTool('Blur');
    await waitFor(() =>
      expect(screen.getByTestId('web-stage-blur').firstChild).toBeTruthy()
    );
    const area = screen.getByRole('img', { name: /Drag across what to blur/ });
    sized(area);
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(area, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Apply blur' }));
    await waitFor(() =>
      expect(storage.uploadWebTourPicture).toHaveBeenCalledTimes(2)
    );
    await waitFor(() =>
      expect(savedPicture()?.original?.path).toBe(
        'web_tour_pictures/t1/up2.jpg'
      )
    );
    expect(savedPicture()?.path).toBe('web_tour_pictures/t1/up1.jpg');
    expect(storage.loadWebTourPicture).toHaveBeenCalledWith(
      'web_tour_pictures/t1/full.jpg'
    );
  });

  it('draws a box, undoes and redoes it, and deletes it from the keyboard', async () => {
    renderEditor(checked(withPicture(tour('Biology 7'))));
    await openTool('Mark up');
    fireEvent.click(screen.getByRole('radio', { name: 'Box' }));
    const surface = screen.getByRole('application', {
      name: /Markup on the picture/,
    });
    sized(surface);
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 60, clientY: 40, pointerId: 1 });
    expect(screen.getAllByTestId('web-markup-shape')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryAllByTestId('web-markup-shape')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    const shape = screen.getByTestId('web-markup-shape');
    expect(Number(shape.getAttribute('width'))).toBeCloseTo(5);
    fireEvent.pointerDown(shape, { clientX: 30, clientY: 20, pointerId: 2 });
    fireEvent.pointerUp(surface, { clientX: 30, clientY: 20, pointerId: 2 });
    fireEvent.keyDown(surface, { key: 'Delete' });
    expect(screen.queryAllByTestId('web-markup-shape')).toHaveLength(0);
    // Markup is shapes on the step, never baked into the file.
    expect(storage.uploadWebTourPicture).not.toHaveBeenCalled();
  });

  it('places numbered markers in order', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderEditor(checked(withPicture(tour('Biology 7'))));
      await openTool('Mark up');
      fireEvent.click(screen.getByRole('radio', { name: 'Number' }));
      const surface = screen.getByRole('application', {
        name: /Markup on the picture/,
      });
      sized(surface);
      fireEvent.pointerDown(surface, {
        clientX: 20,
        clientY: 20,
        pointerId: 1,
      });
      fireEvent.pointerDown(surface, {
        clientX: 60,
        clientY: 60,
        pointerId: 2,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(
        savedPicture()?.markup?.map((m) => (m.kind === 'number' ? m.n : 0))
      ).toEqual([1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retakes only the picture, keeping the target and markup', async () => {
    ext.protocol = 3;
    const set = checked(withPicture(tour('Biology 7')));
    const web = set.steps[0].web;
    if (!web?.picture) throw new Error('no picture');
    set.steps[0] = {
      ...set.steps[0],
      web: {
        ...web,
        picture: {
          ...web.picture,
          markup: [{ id: 'n', kind: 'number', x: 0.5, y: 0.5, n: 1 }],
        },
      },
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderEditor(set);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select picture' })
    );
    const retake = within(
      screen.getByRole('toolbar', { name: 'Picture tools' })
    ).getByRole('button', { name: 'Retake' });
    await waitFor(() => expect(retake).toBeEnabled());
    fireEvent.click(retake);
    expect(rec.repick).toHaveBeenCalledWith('s1');
    await act(
      () =>
        rec.onRepicked?.({
          id: 's1',
          urlPattern: 'https://elsewhere.example/x',
          action: 'click',
          locator: { role: 'button', name: 'Other' },
          picture: { dataUrl: 'data:image/jpeg;base64,AAAA', w: 50, h: 40 },
        }) ?? Promise.resolve()
    );
    const saved = lastSaved()?.steps[0].web;
    expect(saved?.locator).toEqual({ role: 'link', name: 'Biology 7' });
    expect(saved?.urlPattern).toBe(
      'https://orono.schoology.com/course/*/materials'
    );
    expect(saved?.picture?.w).toBe(50);
    expect(saved?.picture?.markup).toHaveLength(1);
    open.mockRestore();
  });

  it('replaces the picture with an uploaded file, which has no ring place', async () => {
    renderEditor(checked(captured(tour('Biology 7'))));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select picture' })
    );
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('web-picture-replace-file'), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(savedPicture()).toEqual({
        path: 'web_tour_pictures/t1/up1.jpg',
        w: 300,
        h: 200,
      })
    );
  });

  it('reports a picture change at publish, against the published copy', async () => {
    const published = checked(withPicture(tour('Biology 7')));
    live.tour = { set: published, publishedAt: 5 };
    const marked = checked(withPicture(tour('Biology 7')));
    const web = marked.steps[0].web;
    if (!web?.picture) throw new Error('no picture');
    marked.steps[0] = {
      ...marked.steps[0],
      web: {
        ...web,
        picture: {
          ...web.picture,
          markup: [{ id: 'b', kind: 'box', x: 0.1, y: 0.1, w: 0.3, h: 0.3 }],
        },
      },
    };
    marked.webPicturesChecked = {
      by: 'admin-1',
      at: 1,
      sig: picturesSignature(published),
    };
    renderEditor(marked);
    fireEvent.click(main());
    expect(
      await screen.findByTestId('publish-check-changed')
    ).toHaveTextContent("Step 1's picture changed since the last publish.");
  });
});

describe('WebTourEditor conditions (E6)', () => {
  it('edits showWhen and doneWhen under More, and a condition expires the check', () => {
    renderEditor(checked(tour('Biology 7')));
    expect(main()).toHaveAttribute('data-state', 'publish');
    openMore();
    fireEvent.change(screen.getByLabelText('Show only when'), {
      target: { value: 'target' },
    });
    expect(main()).toHaveAttribute('data-state', 'check');
    expect(screen.getByText('Only if it appears')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Move on when'), {
      target: { value: 'url' },
    });
    expect(screen.getByLabelText('Page address')).toHaveValue(
      'https://orono.schoology.com/course/*/materials'
    );
  });

  it('flags a page condition that can never hold', () => {
    renderEditor(checked(tour('Biology 7')));
    openMore();
    fireEvent.change(screen.getByLabelText('Show only when'), {
      target: { value: 'url' },
    });
    fireEvent.change(screen.getByLabelText('Page address'), {
      target: { value: 'https://other.example/*' },
    });
    expect(
      screen.getByText('Never plays: the address is on another site')
    ).toBeInTheDocument();
  });
});

describe('WebTourEditor markup and crop guides', () => {
  beforeEach(() => {
    let n = 0;
    storage.uploadWebTourPicture.mockImplementation(() =>
      Promise.resolve(`web_tour_pictures/t1/up${++n}.jpg`)
    );
  });

  it('numbers markers in order, closes the gap on delete, and undo brings the numbers back', async () => {
    renderEditor(checked(withPicture(tour('Biology 7'))));
    await openTool('Mark up');
    fireEvent.click(screen.getByRole('radio', { name: 'Number' }));
    const surface = screen.getByRole('application', {
      name: /Markup on the picture/,
    });
    sized(surface);
    for (const [x, id] of [
      [20, 1],
      [50, 2],
      [80, 3],
    ])
      fireEvent.pointerDown(surface, {
        clientX: x,
        clientY: 50,
        pointerId: id,
      });
    const numbers = () =>
      screen
        .getAllByTestId('tour-picture-markup')
        .flatMap((svg) => Array.from(svg.querySelectorAll('text')))
        .map((t) => t.textContent);
    expect(numbers()).toEqual(['1', '2', '3']);
    // Select the middle marker and delete it.
    fireEvent.pointerDown(screen.getAllByTestId('web-markup-shape')[1], {
      clientX: 50,
      clientY: 50,
      pointerId: 9,
    });
    fireEvent.pointerUp(surface, { clientX: 50, clientY: 50, pointerId: 9 });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(numbers()).toEqual(['1', '2']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(numbers()).toEqual(['1', '2', '3']);
    // The next marker after the undo takes the next free number.
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 10 });
    expect(numbers()).toEqual(['1', '2', '3', '4']);
  });

  it('shows the ring and a faint tip while marking up, with no dim', async () => {
    renderEditor(checked(captured(tour('Biology 7'))));
    await openTool('Mark up');
    const stage = screen.getByTestId('web-stage');
    expect(within(stage).getByTestId('web-stage-guide-ring')).toBeTruthy();
    expect(within(stage).getByTestId('tour-callout')).toBeTruthy();
    expect(within(stage).queryByTestId('tour-spotlight')).toBeNull();
  });

  it('shows the target while cropping and warns when the crop leaves it out', async () => {
    renderEditor(checked(captured(tour('Biology 7'))));
    await openTool('Crop');
    expect(screen.getByTestId('web-crop-target')).toBeTruthy();
    const area = screen.getByRole('group', {
      name: 'Drag the crop or its corners',
    });
    sized(area);
    // Drag the bottom-right corner up past the target, into the top-left.
    fireEvent.pointerDown(screen.getByTestId('web-crop-handle-se'), {
      clientX: 75,
      clientY: 75,
      pointerId: 1,
    });
    fireEvent.pointerMove(area, { clientX: 32, clientY: 32, pointerId: 1 });
    fireEvent.pointerUp(area, { clientX: 32, clientY: 32, pointerId: 1 });
    expect(screen.getByTestId('web-crop-message')).toHaveTextContent(
      "The target is outside this crop, so the ring won't show."
    );
  });

  it('draws markup above the dim in the preview', async () => {
    const set = checked(captured(tour('Biology 7')));
    const web = set.steps[0].web;
    if (!web?.picture) throw new Error('no picture');
    set.steps[0] = {
      ...set.steps[0],
      web: {
        ...web,
        picture: {
          ...web.picture,
          markup: [{ id: 'b', kind: 'box', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
        },
      },
    };
    renderEditor(set);
    const markup = await within(screen.getByTestId('web-stage')).findByTestId(
      'tour-picture-markup'
    );
    expect(markup.style.zIndex).toBe('13510');
  });

  it('lists changed pictures first in the publish check, every one in view', async () => {
    const published = checked(withPicture(tour('Biology 7')));
    published.steps.push({ ...published.steps[0], id: 's2' });
    live.tour = { set: published, publishedAt: 5 };
    const second = published.steps[1].web;
    if (!second) throw new Error('no web');
    const draft = checked({
      ...published,
      steps: [
        published.steps[0],
        {
          ...published.steps[1],
          web: {
            ...second,
            picture: { path: 'web_tour_pictures/t1/new.jpg', w: 10, h: 10 },
          },
        },
      ],
    });
    renderEditor(draft);
    fireEvent.click(main());
    const grid = await screen.findByTestId('publish-check-pictures');
    expect(grid.className).toContain('flex-wrap');
    expect(
      Array.from(grid.querySelectorAll('figcaption')).map((c) => c.textContent)
    ).toEqual(['Step 2, changed', 'Step 1']);
  });
});
