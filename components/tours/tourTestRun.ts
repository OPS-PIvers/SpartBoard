// DEV-only browser run: plays a connector tour on the dummy-backend board and records each step (LIVE_TOUR_ONE_SHOT.md D7).
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  Student,
  WidgetType,
} from '@/types';
import { requestStartTour } from './tourState';

type TourSetup = NonNullable<GuidedLearningSet['tourSetup']>;

export interface TestStepResult {
  index: number;
  stepId: string;
  anchor: string;
  /** found: the control showed; missing: the runner gave up looking; plain: a step with no control. */
  status: 'found' | 'missing' | 'plain';
  /** teacher: Autopilot could not do it (no value), so the run moved on without it. */
  handedBack?: boolean;
  /** A select step whose control showed but had no option matching its value. */
  noOption?: boolean;
  /** The step picture as a PNG data URL, cropped the way the editor crops thumbnails. */
  picture?: string;
  w?: number;
  h?: number;
}

export interface TestRunState {
  setId: string;
  steps: number;
  results: TestStepResult[];
  done: boolean;
  /** The run reached the last step, rather than ending early. */
  finished: boolean;
}

/** The tour as `get_live_tour` returns it; only what playback reads. */
export interface ConnectorTourView {
  set_id: string;
  title?: string;
  steps: (Partial<GuidedLearningStep> & { id: string })[];
  tour_widgets?: string[];
  layouts?: TourSetup['layouts'];
  materials?: TourSetup['materials'];
  use_teacher_board?: boolean;
  autopilot?: boolean;
}

// Made-up names for the class a test run gives widgets that need students.
const SAMPLE_NAMES = [
  'Ada Park',
  'Ben Ortiz',
  'Cleo Grant',
  'Dev Shah',
  'Eli Moore',
  'Fay Kim',
  'Gus Reed',
  'Hana Cole',
  'Ian Ruiz',
  'Jo Lane',
  'Kai Ward',
  'Lu Chen',
];

export const SAMPLE_CLASS_NAME = 'Sample class';

export const sampleStudents = (): Student[] =>
  SAMPLE_NAMES.map((name, i) => {
    const [firstName, lastName] = name.split(' ');
    return { id: `sample-${i + 1}`, firstName, lastName, pin: '' };
  });

let pending: GuidedLearningSet | null = null;
let run: TestRunState | null = null;

/** The set `get_live_tour` describes, shaped the way the runner loads one. */
export function setFromConnectorView(
  view: ConnectorTourView
): GuidedLearningSet {
  const now = Date.now();
  return {
    id: view.set_id,
    title: view.title ?? 'Live tour',
    imageUrls: [],
    steps: view.steps.map((s): GuidedLearningStep => ({
      xPct: 50,
      yPct: 50,
      imageIndex: 0,
      interactionType: 'tooltip',
      ...s,
    })),
    mode: 'tour',
    tourSetup: {
      widgets: (view.tour_widgets ?? []) as WidgetType[],
      ...(view.layouts?.length ? { layouts: view.layouts } : {}),
      ...(view.materials?.length ? { materials: view.materials } : {}),
      ...(view.use_teacher_board ? { useTeacherBoard: true as const } : {}),
      autopilot: true,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export const TEST_RUN_PROJECT = 'dummy';

/** Hands the runner this set instead of a Firestore read; one launch only. */
export function takeTestTour(setId: string): GuidedLearningSet | null {
  if (!pending || pending.id !== setId) return null;
  const set = pending;
  pending = null;
  return set;
}

export function reportTestStep(
  result: Partial<TestStepResult> & Pick<TestStepResult, 'index'>
): void {
  if (!run || run.done) return;
  const prior = run.results[result.index];
  // A control that vanished after Autopilot clicked it was still found, unless its choice had no matching option.
  const keep =
    prior?.status === 'found' &&
    result.status === 'missing' &&
    !result.noOption;
  run.results[result.index] = {
    ...prior,
    ...result,
    ...(keep ? { status: 'found' as const } : {}),
  };
}

/** Whether this run already found the step's control. */
export const testStepFound = (index: number): boolean =>
  run?.results[index]?.status === 'found';

export function endTestRun(finished: boolean): void {
  if (!run || run.done) return;
  run.done = true;
  run.finished = finished;
}

export function startTestTour(view: ConnectorTourView): void {
  const set = setFromConnectorView(view);
  pending = set;
  run = {
    setId: set.id,
    steps: set.steps.length,
    results: [],
    done: false,
    finished: false,
  };
  requestStartTour({ setId: set.id, draft: true });
}

declare global {
  interface Window {
    __liveTourRun?: {
      start: (view: ConnectorTourView) => void;
      state: () => TestRunState | null;
      /** The Firebase project the page talks to; a run needs the dummy one. */
      project: string;
    };
  }
}

/** Exposes the run to scripts/run-live-tour.mjs; dev builds only. */
export function installTestRunHook(): void {
  if (!import.meta.env.DEV || window.__liveTourRun) return;
  const project = () => String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '');
  window.__liveTourRun = {
    // A run clicks destructive controls and adds a class, so it never runs against a real project.
    start: (view) => {
      if (project() !== TEST_RUN_PROJECT)
        throw new Error(
          `Live tour browser runs need the ${TEST_RUN_PROJECT} Firebase project (vite-verify).`
        );
      startTestTour(view);
    },
    state: () => run,
    get project() {
      return project();
    },
  };
}
