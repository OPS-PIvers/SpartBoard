/**
 * Performance baseline harness for the unified Quiz / Video Activity /
 * Guided Learning editors (EditorModalShell / EditorWorkspace stack).
 *
 * Mounts each REAL editor modal (real EditorWorkspace + EditorModalShell +
 * panes + state hooks) inside a <React.Profiler> and scripts four scenarios
 * per editor with realistic authoring-sized data:
 *
 *   (a) mount               — open the modal cold
 *   (b) type 25 characters  — one change event per keypress into a text field
 *   (c) switch selection ×10 — click 10 different questions/tasks/slides
 *   (d) add an item         — add a question / task / step
 *
 * For each scenario we record:
 *   - Profiler commit COUNT (primary metric — must be identical run-to-run)
 *   - summed actualDuration (indicative only; machine-dependent)
 *
 * Results are written to tests/perf/results/baseline.json. The tests assert
 * only that metrics were produced — NO duration thresholds, so this can
 * never be flaky on slow CI machines.
 *
 * Run: pnpm exec vitest run tests/perf/editorPerf.test.tsx
 *
 * Mocking strategy (matches neighboring component tests, e.g.
 * tests/components/widgets/QuizEditorModal.test.tsx and
 * components/widgets/GuidedLearning/components/GuidedLearningPlayer.test.tsx):
 *   - useAuth / useDashboard / useStorage: stubbed hooks (no Firebase).
 *   - useDialog + @/config/firebase: already mocked globally in tests/setup.ts.
 *   - @/utils/ai: stubbed (never invoked — AI features are permission-gated off).
 *   - @/utils/youtube: real exports except loadYouTubeApi, which invokes its
 *     callback synchronously against a fake window.YT.Player so the Video
 *     Activity Timeline reaches its ready state without any network.
 *   - ResizeObserver / getBoundingClientRect / naturalWidth|Height: stubbed
 *     so the Guided Learning canvas computes a real image footprint in jsdom.
 */

import React, { Profiler } from 'react';
import type { ProfilerOnRenderCallback } from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QuizEditorModal } from '@/components/widgets/QuizWidget/components/QuizEditorModal';
import { VideoActivityEditorModal } from '@/components/widgets/VideoActivityWidget/components/VideoActivityEditorModal';
import { GuidedLearningEditorModal } from '@/components/widgets/GuidedLearning/components/GuidedLearningEditorModal';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  QuizData,
  QuizQuestion,
  VideoActivityData,
  VideoActivityQuestion,
} from '@/types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'perf-user', displayName: 'Perf Teacher' },
    isAdmin: false,
    canAccessFeature: () => false,
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadHotspotImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
  }),
}));

vi.mock('@/utils/ai', () => ({
  generateQuiz: vi.fn(),
  generateVideoActivity: vi.fn(),
  buildPromptWithFileContext: vi.fn((prompt: string) => prompt),
}));

vi.mock('@/components/common/DriveFileAttachment', () => ({
  DriveFileAttachment: () => null,
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningAIGenerator',
  () => ({
    GuidedLearningAIGenerator: () => null,
  })
);

vi.mock('@/utils/youtube', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/youtube')>('@/utils/youtube');
  return {
    ...actual,
    loadYouTubeApi: (callback: () => void) => callback(),
  };
});

// ─── jsdom environment stubs ─────────────────────────────────────────────────

/**
 * Fake YT.Player matching the constructor shape declared in utils/youtube.
 * Fires onReady on a microtask (the real API is async; firing synchronously
 * would run before Timeline assigns playerRef.current and be ignored).
 */
class FakeYTPlayer {
  constructor(
    _elementId: string,
    options: {
      height: string;
      width: string;
      videoId: string;
      playerVars?: Record<string, string | number | boolean>;
      events?: {
        onStateChange?: (event: { data: number }) => void;
        onReady?: () => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) {
    queueMicrotask(() => options.events?.onReady?.());
  }

  playVideo() {
    /* noop */
  }
  pauseVideo() {
    /* noop */
  }
  stopVideo() {
    /* noop */
  }
  seekTo(_seconds: number, _allowSeekAhead: boolean) {
    /* noop */
  }
  getCurrentTime() {
    return 0;
  }
  getDuration() {
    return 300;
  }
  getPlayerState() {
    return 5; // CUED
  }
  destroy() {
    /* noop */
  }
}

class ResizeObserverMock {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
  constructor(_callback: ResizeObserverCallback) {
    /* noop */
  }
}

const originalGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getBoundingClientRect'
);

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.YT = { Player: FakeYTPlayer };
  // Square 1000×1000 media inside a 400×200 container → a 200×200 footprint
  // at offsetLeft 100 (object-contain), so canvas clicks land inside it.
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => 1000,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get: () => 1000,
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return {
        width: 400,
        height: 200,
        top: 0,
        left: 0,
        right: 400,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  delete window.YT;
  if (originalGetBoundingClientRectDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getBoundingClientRect',
      originalGetBoundingClientRectDescriptor
    );
  }
});

// ─── Profiler recorder ───────────────────────────────────────────────────────

interface ScenarioMetric {
  scenario: string;
  commits: number;
  actualDurationMs: number;
}

const metrics: ScenarioMetric[] = [];

function createRecorder() {
  let commits = 0;
  let duration = 0;
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    commits += 1;
    duration += actualDuration;
  };
  return {
    onRender,
    start() {
      commits = 0;
      duration = 0;
    },
    record(scenario: string) {
      metrics.push({
        scenario,
        commits,
        actualDurationMs: Number(duration.toFixed(3)),
      });
    },
  };
}

/**
 * Let any asynchronously-scheduled work (microtasks, requestAnimationFrame
 * measuring passes from dnd-kit, the fake YT onReady) flush and commit
 * INSIDE the current scenario window, so commit attribution is identical
 * run-to-run.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

const TYPED_TEXT = 'abcdefghijklmnopqrstuvwxy'; // exactly 25 characters

function typeIntoField(field: HTMLElement, base: string): void {
  for (let i = 1; i <= TYPED_TEXT.length; i++) {
    fireEvent.change(field, {
      target: { value: base + TYPED_TEXT.slice(0, i) },
    });
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** 20 questions: 12 MC, 4 Matching, 4 Ordering (mixed through the list). */
function buildQuiz(): QuizData {
  const questions: QuizQuestion[] = [];
  for (let n = 1; n <= 20; n++) {
    const base = {
      id: `quiz-q${n}`,
      text: `Quiz question ${n} prompt`,
      timeLimit: 30,
      points: 1,
    };
    if (n % 5 === 4) {
      questions.push({
        ...base,
        type: 'Matching',
        correctAnswer: 'mitosis:cell division|osmosis:water diffusion',
        incorrectAnswers: [],
        matchingDistractors: ['photosynthesis'],
      });
    } else if (n % 5 === 0) {
      questions.push({
        ...base,
        type: 'Ordering',
        correctAnswer: 'first step|second step|third step',
        incorrectAnswers: [],
      });
    } else {
      questions.push({
        ...base,
        type: 'MC',
        correctAnswer: `Correct ${n}`,
        incorrectAnswers: [`Wrong ${n}a`, `Wrong ${n}b`, `Wrong ${n}c`],
      });
    }
  }
  return {
    id: 'perf-quiz',
    title: 'Perf Baseline Quiz',
    questions,
    createdAt: 1000,
    updatedAt: 2000,
  };
}

/** 20 timestamped MC tasks at 10s intervals. */
function buildVideoActivity(): VideoActivityData {
  const questions: VideoActivityQuestion[] = [];
  for (let n = 1; n <= 20; n++) {
    questions.push({
      id: `va-q${n}`,
      text: `Video question ${n} prompt`,
      type: 'MC',
      correctAnswer: `Correct ${n}`,
      incorrectAnswers: [`Wrong ${n}a`, `Wrong ${n}b`, `Wrong ${n}c`],
      timeLimit: 30,
      timestamp: n * 10,
      points: 1,
    });
  }
  return {
    id: 'perf-va',
    title: 'Perf Baseline Video Activity',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    questions,
    createdAt: 1000,
    updatedAt: 2000,
  };
}

/** 15 image slides, 30 text-popover steps spread 2-per-slide. */
function buildGuidedLearningSet(): GuidedLearningSet {
  const imageUrls = Array.from(
    { length: 15 },
    (_, i) => `https://example.com/slide-${i + 1}.png`
  );
  const steps: GuidedLearningStep[] = [];
  for (let n = 1; n <= 30; n++) {
    steps.push({
      id: `gl-step${n}`,
      xPct: 20 + (n % 5) * 10,
      yPct: 20 + (n % 4) * 10,
      imageIndex: (n - 1) % 15,
      interactionType: 'text-popover',
      showOverlay: 'none',
      text: `Step ${n} text`,
    });
  }
  return {
    id: 'perf-gl',
    title: 'Perf Baseline Guided Learning',
    imageUrls,
    steps,
    mode: 'structured',
    createdAt: 1000,
    updatedAt: 2000,
  };
}

const noop = () => undefined;
const saveNoop = () => Promise.resolve();

// ─── Scenarios ───────────────────────────────────────────────────────────────

describe('editor performance baseline', () => {
  it('QuizEditor: mount, type ×25, switch ×10, add', async () => {
    const rec = createRecorder();
    const quiz = buildQuiz();

    rec.start();
    render(
      <Profiler id="quiz-editor" onRender={rec.onRender}>
        <QuizEditorModal isOpen quiz={quiz} onClose={noop} onSave={saveNoop} />
      </Profiler>
    );
    await settle();
    rec.record('quiz.mount');

    // (b) Type 25 characters into question 1's prompt textarea.
    const promptField = screen.getByPlaceholderText(
      'e.g. What is the capital of France?'
    );
    rec.start();
    typeIntoField(promptField, 'Quiz question 1 prompt ');
    await settle();
    rec.record('quiz.type25');

    // (c) Switch the selected question 10 times (questions 2..11). Clicking
    // the row's text span bubbles to the row's onSelect handler. The detail
    // header shows the PREVIOUS selection's text, so each lookup is unique.
    rec.start();
    for (let n = 2; n <= 11; n++) {
      fireEvent.click(screen.getByText(`Quiz question ${n} prompt`));
    }
    await settle();
    rec.record('quiz.switchSelection10');

    // (d) Add a new question.
    rec.start();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await settle();
    rec.record('quiz.addQuestion');

    expect(metrics.filter((m) => m.scenario.startsWith('quiz.'))).toHaveLength(
      4
    );
    for (const m of metrics.filter((m) => m.scenario.startsWith('quiz.'))) {
      expect(m.commits).toBeGreaterThan(0);
      expect(m.actualDurationMs).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it('VideoActivityEditor: mount, type ×25, switch ×10, add', async () => {
    const rec = createRecorder();
    const activity = buildVideoActivity();

    rec.start();
    render(
      <Profiler id="va-editor" onRender={rec.onRender}>
        <VideoActivityEditorModal
          isOpen
          activity={activity}
          onClose={noop}
          onSave={saveNoop}
        />
      </Profiler>
    );
    await settle(); // flushes the fake YT onReady (playerReady, duration)
    rec.record('va.mount');

    // (b) Type 25 characters into the selected question's prompt.
    const promptField = screen.getByPlaceholderText('Enter your question…');
    rec.start();
    typeIntoField(promptField, 'Video question 1 prompt ');
    await settle();
    rec.record('va.type25');

    // (c) Switch the selected task 10 times via the question pill strip.
    rec.start();
    for (let n = 2; n <= 11; n++) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`^Question ${n} at `) })
      );
    }
    await settle();
    rec.record('va.switchSelection10');

    // (d) Add a task at the playhead (0:00 — fake player never plays).
    rec.start();
    fireEvent.click(screen.getByRole('button', { name: /^Add at / }));
    await settle();
    rec.record('va.addTask');

    expect(metrics.filter((m) => m.scenario.startsWith('va.'))).toHaveLength(4);
    for (const m of metrics.filter((m) => m.scenario.startsWith('va.'))) {
      expect(m.commits).toBeGreaterThan(0);
      expect(m.actualDurationMs).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it('GuidedLearningEditor: mount, type ×25, switch slides ×10, add step', async () => {
    const rec = createRecorder();
    const set = buildGuidedLearningSet();

    rec.start();
    render(
      <Profiler id="gl-editor" onRender={rec.onRender}>
        <GuidedLearningEditorModal
          isOpen
          set={set}
          meta={null}
          onClose={noop}
          onSave={saveNoop}
        />
      </Profiler>
    );
    await settle();
    rec.record('gl.mount');

    // Setup (not measured): give the canvas an image footprint so hotspot
    // placement works, and select step 1 so the detail pane shows its editor.
    const canvasImg = screen.getByAltText('Current step image');
    fireEvent.load(canvasImg);
    fireEvent.click(screen.getByRole('button', { name: /^Step 1 on image/ }));
    await settle();

    // (b) Type 25 characters into the selected step's text content.
    const textField = screen.getByPlaceholderText('Enter the text to display…');
    rec.start();
    typeIntoField(textField, 'Step 1 text ');
    await settle();
    rec.record('gl.type25');

    // (c) Switch the visible slide 10 times (slides 2..11).
    rec.start();
    for (let n = 2; n <= 11; n++) {
      fireEvent.click(screen.getByRole('button', { name: `Slide ${n}` }));
    }
    await settle();
    rec.record('gl.switchSlide10');

    // (d) Add a step: arm hotspot placement, then click inside the image
    // footprint (200×200 at offsetLeft 100 inside the stubbed 400×200 rect).
    rec.start();
    fireEvent.click(screen.getByRole('button', { name: 'Add hotspot' }));
    fireEvent.click(canvasImg.parentElement as HTMLElement, {
      clientX: 200,
      clientY: 100,
    });
    await settle();
    rec.record('gl.addStep');

    expect(metrics.filter((m) => m.scenario.startsWith('gl.'))).toHaveLength(4);
    for (const m of metrics.filter((m) => m.scenario.startsWith('gl.'))) {
      expect(m.commits).toBeGreaterThan(0);
      expect(m.actualDurationMs).toBeGreaterThanOrEqual(0);
    }
  }, 30000);
});

// ─── Results file ────────────────────────────────────────────────────────────

afterAll(() => {
  // Vitest serves test modules over a non-file URL, so import.meta.url can't
  // be used for paths — resolve from the repo root (vitest's cwd) instead.
  const resultsDir = resolve(process.cwd(), 'tests/perf/results');
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(
    join(resultsDir, 'baseline.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        runCommand: 'pnpm exec vitest run tests/perf/editorPerf.test.tsx',
        note:
          'Profiler commit counts are the deterministic primary metric and ' +
          'must be identical across runs. actualDurationMs is machine-' +
          'dependent and indicative only — compare medians of 3 runs.',
        scenarios: metrics,
      },
      null,
      2
    ) + '\n'
  );
});
