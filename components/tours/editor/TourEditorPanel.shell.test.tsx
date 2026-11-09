import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import type { PublishedTour } from '@/components/tours/tourSnapshot';
import { TourEditorPanel } from './TourEditorPanel';
import {
  IDLE_PLAYBACK,
  clearTourEdit,
  getTourEdit,
  setTourEdit,
} from './tourEditStore';
import { useLiveTourPublish } from './useLiveTourPublish';
import type { TourEditorSession } from './useTourEditorSession';

const h = vi.hoisted(() => ({
  published: null as PublishedTour | null,
  publish: vi.fn<(set: unknown, uid: string) => Promise<void>>(() =>
    Promise.resolve()
  ),
}));
vi.mock('@/components/tours/publishedTours', () => ({
  usePublishedTour: () => ({ loaded: true, tour: h.published }),
  publishTour: h.publish,
}));
vi.mock('@/components/tours/tourReview', () => ({
  useTourReview: () => ({}),
  saveTourNote: vi.fn(() => Promise.resolve()),
}));

const step = (
  id: string,
  patch: Partial<GuidedLearningStep> = {}
): GuidedLearningStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'text-popover',
  label: `Step ${id}`,
  tour: { anchor: 'dock.open-tools', action: 'click' },
  ...patch,
});

const tourOf = (steps: GuidedLearningStep[]): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Clock tour',
  mode: 'tour',
  imageUrls: [],
  createdAt: 1,
  updatedAt: 1,
  steps,
});

const sessionFor = (
  set: GuidedLearningSet,
  over: Partial<TourEditorSession> = {}
): TourEditorSession => ({
  set,
  selected: 0,
  select: vi.fn(),
  updateStep: vi.fn(),
  setBinding: vi.fn(),
  insertStepAfter: vi.fn(() => step('new')),
  insertStepsAfter: vi.fn(),
  setThumbnail: vi.fn(),
  deleteStep: vi.fn(),
  moveStep: vi.fn(),
  updateSet: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  canUndo: false,
  canRedo: false,
  saveState: 'saved',
  flush: vi.fn(() => Promise.resolve(true)),
  isConflicted: () => false,
  ...over,
});

const Wired: React.FC<{
  session: TourEditorSession;
  checkNeeded?: boolean;
  onCopyForClaude?: () => void;
}> = ({ session, checkNeeded, onCopyForClaude }) => {
  const publish = useLiveTourPublish(session);
  return (
    <TourEditorPanel
      session={session}
      playback={IDLE_PLAYBACK}
      readAloud={{ on: false, onToggle: vi.fn() }}
      onClose={vi.fn()}
      initialCollapsed={false}
      initialSide="right"
      publish={publish}
      checkNeeded={checkNeeded}
      onCopyForClaude={onCopyForClaude}
    />
  );
};

const renderPanel = (
  session: TourEditorSession,
  props: { checkNeeded?: boolean; onCopyForClaude?: () => void } = {}
) =>
  render(
    <AuthContext.Provider
      value={
        {
          user: { uid: 'admin-1', email: 'admin@school.org' },
          canAccessFeature: (id: string) => id === 'claude-connector',
        } as unknown as AuthContextType
      }
    >
      <Wired session={session} {...props} />
    </AuthContext.Provider>
  );

const main = () => screen.getByTestId('tour-shell-main');
const status = () => screen.getByTestId('tour-shell-status');

beforeEach(() => {
  h.published = null;
  h.publish.mockClear();
  clearTourEdit();
});

describe('Live tour editor header', () => {
  it('saves the draft, then publishes what was saved', async () => {
    const set = tourOf([step('a')]);
    setTourEdit({ set, selected: 0, replay: 0, readAloud: false });
    const session = sessionFor(set);
    renderPanel(session);
    expect(status()).toHaveTextContent('Saved');
    expect(status()).toHaveTextContent('Draft');
    expect(main()).toHaveTextContent('Publish');
    await act(async () => {
      fireEvent.click(main());
      await Promise.resolve();
    });
    expect(session.flush).toHaveBeenCalled();
    expect(h.publish).toHaveBeenCalledWith(set, 'admin-1');
  });

  it('publishes nothing when the draft could not be saved', async () => {
    const set = tourOf([step('a')]);
    setTourEdit({ set, selected: 0, replay: 0, readAloud: false });
    renderPanel(
      sessionFor(set, { flush: vi.fn(() => Promise.resolve(false)) })
    );
    await act(async () => {
      fireEvent.click(main());
      await Promise.resolve();
    });
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('lists broken links before publishing anyway', async () => {
    const set = tourOf([
      step('a', { tour: { anchor: 'gone.anchor', action: 'click' } }),
    ]);
    setTourEdit({ set, selected: 0, replay: 0, readAloud: false });
    renderPanel(sessionFor(set));
    fireEvent.click(main());
    expect(h.publish).not.toHaveBeenCalled();
    const confirm = screen.getByTestId('tour-editor-publish-confirm');
    expect(confirm).toHaveTextContent('Step 1');
    await act(async () => {
      fireEvent.click(
        within(confirm).getByRole('button', { name: 'Publish anyway' })
      );
      await Promise.resolve();
    });
    expect(h.publish).toHaveBeenCalled();
  });

  it('asks for text first and takes the admin to the first step without any', () => {
    const set = tourOf([
      step('a'),
      step('b', { label: '', text: '' }),
      step('c', { label: '' }),
    ]);
    const session = sessionFor(set);
    renderPanel(session);
    expect(main()).toHaveAttribute('data-state', 'write');
    expect(main()).toHaveTextContent('Write text');
    expect(status()).toHaveTextContent('2 steps need text');
    fireEvent.click(main());
    expect(session.select).toHaveBeenCalledWith(1);
  });

  it('marks each step that needs text in the outline, with its stand-in title muted', () => {
    renderPanel(
      sessionFor(
        tourOf([step('a'), step('b', { label: '', text: '' }), step('c')])
      )
    );
    const rows = screen.getAllByTestId('tour-editor-step');
    expect(rows[1]).toHaveTextContent('Needs text');
    expect(rows[1].querySelector('[data-fallback]')).toHaveTextContent(
      'Open Tools button in the collapsed dock'
    );
    expect(rows[0]).not.toHaveTextContent('Needs text');
    expect(rows[2]).not.toHaveTextContent('Needs text');
    expect(rows[0].querySelector('[data-fallback]')).toBeNull();
  });

  it('puts the cursor in the Title of the first step without text', async () => {
    const set = tourOf([
      step('a'),
      step('b', { label: '', text: '' }),
      step('c', { label: '' }),
    ]);
    const Stateful = () => {
      const [selected, select] = React.useState(0);
      return <Wired session={sessionFor(set, { selected, select })} />;
    };
    render(
      <AuthContext.Provider
        value={
          {
            user: { uid: 'admin-1', email: 'admin@school.org' },
            canAccessFeature: () => false,
          } as unknown as AuthContextType
        }
      >
        <Stateful />
      </AuthContext.Provider>
    );
    fireEvent.click(main());
    await act(
      () => new Promise<void>((done) => requestAnimationFrame(() => done()))
    );
    const card = screen.getByTestId('tour-editor-card');
    expect(card.closest('[data-step-id]')).toHaveAttribute('data-step-id', 'b');
    expect(document.activeElement).toBe(within(card).getByLabelText('Title'));
  });

  it('shows Published, disabled, then Publish changes once something changed', () => {
    const set = tourOf([step('a')]);
    h.published = { set, publishedAt: 5, publishedBy: 'admin-1' };
    const { unmount } = renderPanel(sessionFor(set));
    expect(main()).toHaveTextContent('Published');
    expect(main()).toBeDisabled();
    unmount();
    renderPanel(sessionFor({ ...set, title: 'Renamed' }));
    expect(status()).toHaveTextContent('Changed since publish');
    expect(main()).toHaveTextContent('Publish changes');
    expect(main()).toBeEnabled();
  });

  it('asks for a check while playtest notes are open, and plays from step 1', () => {
    const set = tourOf([step('a'), step('b')]);
    setTourEdit({ set, selected: 1, replay: 2, readAloud: false });
    renderPanel(sessionFor(set, { selected: 1 }), { checkNeeded: true });
    expect(main()).toHaveTextContent('Check tour');
    expect(status()).toHaveTextContent('Check needed');
    fireEvent.click(main());
    expect(getTourEdit()).toMatchObject({ selected: 0, replay: 3 });
  });

  it('plays the draft from step 1 with Play', () => {
    const set = tourOf([step('a'), step('b')]);
    setTourEdit({ set, selected: 1, replay: 0, readAloud: false });
    renderPanel(sessionFor(set, { selected: 1 }));
    fireEvent.click(screen.getByTestId('tour-shell-play'));
    expect(getTourEdit()).toMatchObject({ selected: 0, replay: 1 });
  });

  it('keeps only what Live supports in the ⋯ menu', () => {
    const copy = vi.fn();
    renderPanel(sessionFor(tourOf([step('a')])), { onCopyForClaude: copy });
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu');
    const items = [...menu.querySelectorAll('[role^="menuitem"]')].map(
      (el) => el.textContent
    );
    expect(items).toEqual([
      'Copy for Claude',
      'Read aloud',
      'Move to the other side',
    ]);
    fireEvent.click(within(menu).getByText('Copy for Claude'));
    expect(copy).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('puts Add step and Record from here at the foot of the outline', () => {
    renderPanel(sessionFor(tourOf([step('a')])));
    const foot = screen.getByTestId('tour-shell-outline-foot');
    expect(
      within(foot).getByRole('button', { name: 'Add step' })
    ).toBeInTheDocument();
    expect(
      within(foot).getByRole('button', { name: 'Record from here' })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('tour-shell-header')).queryByRole('button', {
        name: 'Add step',
      })
    ).toBeNull();
  });
});

describe('Live step card', () => {
  it('shows Title, Tip and the control, with rare tools under More', () => {
    const session = sessionFor(tourOf([step('a', { text: 'Open it' })]));
    renderPanel(session);
    const card = screen.getByTestId('tour-editor-card');
    expect(within(card).getByLabelText('Title')).toHaveValue('Step a');
    expect(within(card).getByLabelText('Tip')).toHaveValue('Open it');
    expect(within(card).getByTestId('tour-editor-control')).toBeInTheDocument();
    expect(screen.queryByText('Teacher must click this')).toBeNull();
    expect(screen.queryByTestId('tour-editor-step-note')).toBeNull();
    fireEvent.click(screen.getByTestId('tour-step-more'));
    expect(screen.getByText('Teacher must click this')).toBeInTheDocument();
    expect(screen.getByTestId('tour-editor-step-note')).toBeInTheDocument();
    expect(screen.getByTestId('tour-editor-show-when')).toBeInTheDocument();
  });

  it('edits show-when and done-when conditions under More', () => {
    const session = sessionFor(
      tourOf([
        step('a', {
          tour: {
            anchor: 'dock.open-tools',
            action: 'click',
            showWhen: ['class-added'],
            doneWhen: 'building-saved',
          },
        }),
      ])
    );
    renderPanel(session);
    fireEvent.click(screen.getByTestId('tour-step-more'));
    fireEvent.change(screen.getByLabelText('Add a condition'), {
      target: { value: 'drive-connected' },
    });
    expect(session.setBinding).toHaveBeenLastCalledWith(
      'a',
      expect.objectContaining({
        showWhen: ['class-added', 'drive-connected'],
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove A class is added' })
    );
    expect(vi.mocked(session.setBinding).mock.lastCall?.[1]).not.toHaveProperty(
      'showWhen'
    );
    fireEvent.change(screen.getByLabelText('Move on when'), {
      target: { value: '' },
    });
    expect(vi.mocked(session.setBinding).mock.lastCall?.[1]).not.toHaveProperty(
      'doneWhen'
    );
  });

  it('shows Retake only once the picture is selected', () => {
    renderPanel(
      sessionFor(
        tourOf([
          step('a', {
            tour: {
              anchor: 'dock.open-tools',
              action: 'click',
              thumbnail: {
                url: 'https://example.test/a.png',
                anchor: 'dock.open-tools',
                w: 100,
                h: 60,
              },
            },
          }),
        ])
      )
    );
    expect(screen.getByTestId('tour-editor-thumbnail')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retake picture' })).toBeNull();
    fireEvent.click(screen.getByTestId('tour-step-picture'));
    expect(
      screen.getByRole('button', { name: 'Retake picture' })
    ).toBeInTheDocument();
  });
});
