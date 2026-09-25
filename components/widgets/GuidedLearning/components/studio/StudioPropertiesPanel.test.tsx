import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import i18n from '@/i18n';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningStudio } from './GuidedLearningStudio';
import { INTERACTION_ORDER } from './studioOptions';

const auth = vi.hoisted(() => ({
  user: { uid: 'test-user' },
  isAdmin: true,
  canAccessFeature: () => false,
}));
const storage = vi.hoisted(() => ({
  uploading: false,
  uploadGuidedLearningMedia: vi.fn(),
  uploadGuidedLearningImage: vi.fn(),
  deleteFile: vi.fn(),
  deleteDriveFile: vi.fn(),
}));
const dialog = vi.hoisted(() => ({
  currentDialog: null,
  showAlert: vi.fn(),
  showConfirm: vi.fn<(message: string, opts?: unknown) => Promise<boolean>>(),
  showPrompt: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useStorage', () => ({ useStorage: () => storage }));
vi.mock('@/context/useDialog', () => ({ useDialog: () => dialog }));

const SLIDE_1 = 'https://example.com/slide-1.png';
const SLIDE_2 = 'https://example.com/slide-2.png';

const step = (patch: Partial<GuidedLearningStep> = {}): GuidedLearningStep => ({
  id: 'step-1',
  xPct: 40,
  yPct: 30,
  imageIndex: 0,
  interactionType: 'tooltip',
  text: 'Click **Start**',
  ...patch,
});

const buildSet = (
  patch: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Timer tour',
  imageUrls: [SLIDE_1],
  steps: [step()],
  mode: 'guided',
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

type StudioProps = React.ComponentProps<typeof GuidedLearningStudio>;
let restore: (() => void) | null = null;

function renderStudio(props: Partial<StudioProps> = {}) {
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  });
  restore = handle.restore;
  const onSave = vi.fn<StudioProps['onSave']>().mockResolvedValue(undefined);
  const onClose = vi.fn<StudioProps['onClose']>();
  render(
    <GuidedLearningStudio
      set={buildSet()}
      meta={null}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />
  );
  act(() => handle.fireResize());
  return { onSave, onClose };
}

async function closeAndGetSaved({
  onSave,
  onClose,
}: ReturnType<typeof renderStudio>): Promise<GuidedLearningSet> {
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const last = onSave.mock.lastCall;
  if (!last) throw new Error('onSave was never called');
  return last[0];
}

const stepSection = () => screen.getByTestId('gl-studio-step-section');
const slideSection = () => screen.getByTestId('gl-studio-slide-section');
const interaction = () => screen.getByRole('combobox', { name: 'Interaction' });
const titleInput = () => screen.getByRole('textbox', { name: 'Title' });
const undo = () => fireEvent.click(screen.getByTestId('gl-studio-undo'));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  dialog.showConfirm.mockResolvedValue(false);
});
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
});

describe('Studio properties panel', () => {
  it('shows the Step and Slide sections together when a step is selected', () => {
    renderStudio({
      set: buildSet({
        imageUrls: [SLIDE_1, SLIDE_2],
        steps: [step(), step({ id: 'step-2', imageIndex: 1, label: 'Stop' })],
      }),
      initialStepId: 'step-2',
    });
    expect(
      within(stepSection()).getByRole('heading', { name: 'Step 2' })
    ).toBeInTheDocument();
    expect(
      within(slideSection()).getByRole('heading', { name: 'Slide 2' })
    ).toBeInTheDocument();
    expect(within(slideSection()).getByText('Image')).toBeInTheDocument();
    expect(screen.getByTestId('gl-studio-pulse')).toBeInTheDocument();
    expect(screen.getByTestId('gl-studio-transition')).toBeInTheDocument();
    expect(screen.getByTestId('gl-studio-region-controls')).toBeInTheDocument();
    expect(screen.getByTestId('gl-studio-narration')).toBeInTheDocument();
    expect(screen.queryByTestId('gl-studio-set-settings')).toBeNull();
  });

  it('names steps "Step N", never "Hotspot N"', () => {
    renderStudio({ initialStepId: 'step-1' });
    expect(
      within(stepSection()).getByRole('heading', { name: 'Step 1' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Hotspot \d/)).toBeNull();
  });

  it('shows the activity settings and the current slide with nothing selected', () => {
    renderStudio();
    expect(
      screen.getByRole('heading', { name: 'Activity settings' })
    ).toBeInTheDocument();
    expect(
      within(slideSection()).getByRole('heading', { name: 'Slide 1' })
    ).toBeInTheDocument();
  });

  it('has no Tooltip Position or Offset controls, only automatic or placed callouts', () => {
    renderStudio({ initialStepId: 'step-1' });
    expect(screen.queryByText(/Tooltip Position/i)).toBeNull();
    expect(screen.queryByText(/Offset/i)).toBeNull();
    const placement = screen.getByTestId('gl-studio-callout-placement');
    expect(within(placement).getByText('Automatic')).toBeInTheDocument();
    expect(
      within(placement).queryByRole('button', { name: 'Reset to auto' })
    ).toBeNull();
  });

  it('resets a pinned callout to automatic', async () => {
    const handles = renderStudio({
      set: buildSet({ steps: [step({ calloutPin: { xPct: 70, yPct: 20 } })] }),
      initialStepId: 'step-1',
    });
    const placement = screen.getByTestId('gl-studio-callout-placement');
    expect(within(placement).getByText('Placed by you')).toBeInTheDocument();
    fireEvent.click(
      within(placement).getByRole('button', { name: 'Reset to auto' })
    );
    expect(within(placement).getByText('Automatic')).toBeInTheDocument();
    const saved = await closeAndGetSaved(handles);
    expect(saved.steps[0].calloutPin).toBeUndefined();
  });

  it('clears the classic editor side and offset when reset to automatic', async () => {
    const handles = renderStudio({
      set: buildSet({
        steps: [step({ tooltipPosition: 'above', tooltipOffset: 24 })],
      }),
      initialStepId: 'step-1',
    });
    const placement = screen.getByTestId('gl-studio-callout-placement');
    expect(
      within(placement).getByText('Automatic, prefers above (older setting)')
    ).toBeInTheDocument();
    fireEvent.click(
      within(placement).getByRole('button', { name: 'Reset to auto' })
    );
    const saved = await closeAndGetSaved(handles);
    expect(saved.steps[0].tooltipPosition).toBeUndefined();
    expect(saved.steps[0].tooltipOffset).toBeUndefined();
  });

  it('sets the Guided pace from Activity settings, and hides it outside Guided mode', async () => {
    const handles = renderStudio();
    const pace = screen.getByRole('group', { name: 'Guided pace' });
    expect(
      within(pace).getByRole('button', { name: 'Standard' })
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(pace).getByRole('button', { name: 'Calm' }));
    expect(within(pace).getByRole('button', { name: 'Calm' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(pace).getByRole('button', { name: 'Calm' })).toHaveAttribute(
      'title',
      'Each step stays up about a third longer.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Structured' }));
    expect(screen.queryByRole('group', { name: 'Guided pace' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Guided' }));
    const saved = await closeAndGetSaved(handles);
    expect(saved.watchPace).toBe('calm');
  });

  it('undoes the Guided pace like any other edit', () => {
    renderStudio();
    const pace = screen.getByRole('group', { name: 'Guided pace' });
    fireEvent.click(within(pace).getByRole('button', { name: 'Calm' }));
    undo();
    expect(
      within(screen.getByRole('group', { name: 'Guided pace' })).getByRole(
        'button',
        { name: 'Standard' }
      )
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('coalesces typing into one undo entry and keeps each choice its own', () => {
    renderStudio({ initialStepId: 'step-1' });
    fireEvent.change(titleInput(), { target: { value: 'S' } });
    fireEvent.change(titleInput(), { target: { value: 'St' } });
    fireEvent.change(titleInput(), { target: { value: 'Start' } });
    fireEvent.change(interaction(), { target: { value: 'audio' } });
    expect(interaction()).toHaveValue('audio');
    undo();
    expect(interaction()).toHaveValue('tooltip');
    expect(titleInput()).toHaveValue('Start');
    undo();
    expect(titleInput()).toHaveValue('');
  });

  it('keeps the title and the text as separate undo entries', () => {
    renderStudio({ initialStepId: 'step-1' });
    const text = screen.getByRole('textbox', { name: 'Text' });
    fireEvent.change(titleInput(), { target: { value: 'Start' } });
    fireEvent.change(text, { target: { value: 'Press Start' } });
    undo();
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue(
      'Click **Start**'
    );
    expect(titleInput()).toHaveValue('Start');
  });

  it('shows the zoom, spotlight and overlay controls for focus interactions', () => {
    renderStudio({ initialStepId: 'step-1' });
    fireEvent.change(interaction(), {
      target: { value: 'pan-zoom-spotlight' },
    });
    expect(screen.getByRole('slider', { name: /Zoom/ })).toBeInTheDocument();
    expect(
      screen.getByRole('slider', { name: /Spotlight size/ })
    ).toBeInTheDocument();
    const overlay = screen.getByRole('group', { name: 'Text overlay' });
    expect(screen.queryByRole('textbox', { name: 'Text' })).toBeNull();
    fireEvent.click(within(overlay).getByRole('button', { name: 'Banner' }));
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Banner color' })
    ).toBeInTheDocument();
  });

  it('saves auto-advance and the hidden marker', async () => {
    const handles = renderStudio({ initialStepId: 'step-1' });
    const seconds = screen.getByRole('spinbutton', {
      name: 'Move on after (seconds)',
    });
    expect(seconds).toHaveValue(null);
    fireEvent.change(seconds, { target: { value: '8' } });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Always hide the marker/ })
    );
    const saved = await closeAndGetSaved(handles);
    expect(saved.steps[0].autoAdvanceDuration).toBe(8);
    expect(saved.steps[0].hotspotAlwaysHidden).toBe(true);
  });

  it('moves the step to another slide from the panel', () => {
    renderStudio({
      set: buildSet({ imageUrls: [SLIDE_1, SLIDE_2] }),
      initialStepId: 'step-1',
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'On slide' }), {
      target: { value: '1' },
    });
    expect(
      within(slideSection()).getByRole('heading', { name: 'Slide 2' })
    ).toBeInTheDocument();
  });

  it('deletes the step from the panel', () => {
    renderStudio({ initialStepId: 'step-1' });
    fireEvent.click(
      within(stepSection()).getByRole('button', { name: 'Delete step' })
    );
    expect(screen.queryByTestId('gl-studio-step-section')).toBeNull();
  });

  describe('translation', () => {
    afterEach(async () => {
      await i18n.changeLanguage('en');
    });

    it('renders the panel in the teacher language', async () => {
      await i18n.changeLanguage('de');
      renderStudio({ initialStepId: 'step-1' });
      expect(
        within(stepSection()).getByRole('heading', { name: 'Schritt 1' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: 'Interaktion' })
      ).toBeInTheDocument();
      expect(
        within(slideSection()).getByRole('heading', { name: 'Folie 1' })
      ).toBeInTheDocument();
      expect(screen.queryByText('Interaction')).toBeNull();
      expect(screen.queryByText('Title')).toBeNull();
    });

    it.each(['en', 'es', 'de', 'fr'])(
      'has every option label the panel builds in %s',
      (lng) => {
        const keys = [
          ...INTERACTION_ORDER.map((v) => `interaction_${v}`),
          ...['multiple-choice', 'matching', 'sorting'].map(
            (v) => `question_${v}`
          ),
          ...['none', 'popover', 'tooltip', 'banner'].map(
            (v) => `overlay_${v}`
          ),
          ...['blue', 'red', 'neutral'].map((v) => `tone_${v}`),
          ...['structured', 'guided', 'explore'].flatMap((v) => [
            `mode_${v}`,
            `modeDesc_${v}`,
          ]),
          ...['standard', 'calm'].map((v) => `pace_${v}`),
          'paceDesc_calm',
          ...['consistent', 'reminder', 'off'].map((v) => `pulse_${v}`),
          ...['consistent', 'reminder'].map((v) => `pulseDesc_${v}`),
          ...['none', 'slide', 'fade'].map((v) => `transition_${v}`),
          ...['image', 'video'].map((v) => `slideKind_${v}`),
          ...['above', 'below', 'left', 'right'].map((v) => `calloutSide_${v}`),
          ...['point', 'rect', 'ellipse', 'polygon'].map((v) => `shape_${v}`),
        ];
        const bundle = i18n.getResourceBundle(lng, 'translation') as {
          glStudio: Record<string, unknown>;
        };
        const missing = keys.filter(
          (k) => typeof bundle.glStudio[k] !== 'string'
        );
        expect(missing).toEqual([]);
      }
    );
  });
});
