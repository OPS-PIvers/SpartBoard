import React, { Profiler } from 'react';
import type { ProfilerOnRenderCallback } from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { mockStageLayout, rect } from '@/tests/utils/mockStageLayout';
import { manualFrames } from '@/tests/utils/manualFrames';
import { GuidedLearningStudio } from '@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio';

// The classic editor on editorPerf.test.tsx's gl.* scenarios with these stable mocks: commits, median ms of 3 runs.
const CLASSIC = {
  mount: { commits: 3, ms: 68.5 },
  type25: { commits: 26, ms: 155.7 },
  switchSlide10: { commits: 10, ms: 68.5 },
  addStep: { commits: 3, ms: 18.8 },
} as const;

const stageRenders = vi.hoisted(() => ({ count: 0 }));

// Stable like the real hooks, so memoized panes are measured fairly.
const hooks = vi.hoisted(() => ({
  auth: {
    user: { uid: 'perf-user', displayName: 'Perf Teacher' },
    isAdmin: true,
    canAccessFeature: () => false,
    canAccessQuizMediaResponse: () => false,
  },
  storage: {
    uploading: false,
    uploadHotspotImage: () => Promise.resolve(),
    uploadGuidedLearningMedia: () => Promise.resolve(),
    uploadGuidedLearningImage: () => Promise.resolve(),
    deleteFile: () => Promise.resolve(),
    deleteDriveFile: () => Promise.resolve(),
  },
  dashboard: { addToast: () => undefined },
}));
vi.mock('@/context/useAuth', () => ({ useAuth: () => hooks.auth }));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => hooks.dashboard,
}));
vi.mock('@/hooks/useStorage', () => ({ useStorage: () => hooks.storage }));
vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningAIGenerator',
  () => ({ GuidedLearningAIGenerator: () => null })
);
vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningStage',
  async (importOriginal) => {
    const real =
      await importOriginal<
        typeof import('@/components/widgets/GuidedLearning/components/GuidedLearningStage')
      >();
    const Counted = (
      props: React.ComponentProps<typeof real.GuidedLearningStage>
    ) => (
      <Profiler
        id="gl-stage"
        onRender={() => {
          stageRenders.count++;
        }}
      >
        <real.GuidedLearningStage {...props} />
      </Profiler>
    );
    return { ...real, GuidedLearningStage: Counted };
  }
);

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
      const m = {
        scenario,
        commits,
        actualDurationMs: Number(duration.toFixed(3)),
      };
      metrics.push(m);
      return m;
    },
  };
}

// Lets async work commit inside the current scenario window.
async function settle(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

const TYPED_TEXT = 'abcdefghijklmnopqrstuvwxy';

// The editorPerf.test.tsx fixture: 15 slides, 30 text-popover steps.
function buildSet(): GuidedLearningSet {
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

// The stage is 720×520 at the origin showing a same-aspect image, so 1% = 7.2px × 5.2px.
const at = (xPct: number, yPct: number) => ({
  clientX: xPct * 7.2,
  clientY: yPct * 5.2,
});

let restore: (() => void) | null = null;
function mountStudio(
  set: GuidedLearningSet,
  onRender: ProfilerOnRenderCallback
) {
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
    // Keeps the callout clear of the region so the drag moves the region.
    rectFor: (el) =>
      el.hasAttribute('data-gl-callout') ? rect(600, 400, 100, 60) : null,
  });
  restore = handle.restore;
  render(
    <Profiler id="gl-studio" onRender={onRender}>
      <GuidedLearningStudio
        set={set}
        meta={null}
        onClose={() => undefined}
        onSave={() => Promise.resolve()}
      />
    </Profiler>
  );
  act(() => handle.fireResize());
}

afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
});

describe('Guided Learning Studio performance', () => {
  it('mount, type ×25, switch slides ×10, add step', async () => {
    const rec = createRecorder();

    rec.start();
    mountStudio(buildSet(), rec.onRender);
    await settle();
    const mount = rec.record('studio.mount');

    const timeline = screen.getByRole('region', { name: 'Play order' });
    fireEvent.click(within(timeline).getByRole('button', { name: 'Step 1' }));
    await settle();

    const textField = screen.getByPlaceholderText(
      'What should students do here?'
    );
    rec.start();
    for (let i = 1; i <= TYPED_TEXT.length; i++) {
      fireEvent.change(textField, {
        target: { value: `Step 1 text ${TYPED_TEXT.slice(0, i)}` },
      });
    }
    await settle();
    const type25 = rec.record('studio.type25');

    rec.start();
    for (let n = 2; n <= 11; n++) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`^Slide ${n},`) })
      );
    }
    // Outlasts the stage's 500ms slide transition so its last commit always lands here.
    await settle(600);
    const switch10 = rec.record('studio.switchSlide10');

    rec.start();
    fireEvent.keyDown(window, { key: 'a' });
    const layer = screen.getByTestId('gl-studio-edit-layer');
    fireEvent.pointerDown(layer, { button: 0, pointerId: 1, ...at(50, 50) });
    fireEvent.pointerUp(layer, { pointerId: 1, ...at(50, 50) });
    await settle();
    const add = rec.record('studio.addStep');

    const playOrder = screen.getByRole('region', { name: 'Play order' });
    expect(
      within(playOrder).getAllByRole('button', { name: /^Step \d+$/ })
    ).toHaveLength(31);
    expect(mount.commits).toBeLessThanOrEqual(CLASSIC.mount.commits);
    expect(type25.commits).toBeLessThanOrEqual(CLASSIC.type25.commits);
    // The stage commits again as each slide's media mounts, and twice as the transition ends.
    expect(switch10.commits).toBeLessThanOrEqual(
      CLASSIC.switchSlide10.commits * 2 + 2
    );
    expect(add.commits).toBeLessThanOrEqual(CLASSIC.addStep.commits);
  }, 30000);

  it('drags a region across 60 moves with at most one stage render per frame and one history entry', async () => {
    const rec = createRecorder();
    const region: GuidedLearningStep = {
      id: 'region-1',
      xPct: 30,
      yPct: 30,
      imageIndex: 0,
      interactionType: 'tooltip',
      showOverlay: 'tooltip',
      text: 'Drag me',
      region: { shape: 'rect', wPct: 20, hPct: 20 },
    };
    const set: GuidedLearningSet = {
      ...buildSet(),
      schemaVersion: 3,
      imageUrls: ['https://example.com/slide-1.png'],
      steps: [region],
    };
    mountStudio(set, rec.onRender);
    await settle();

    const timeline = screen.getByRole('region', { name: 'Play order' });
    fireEvent.click(within(timeline).getByRole('button', { name: 'Step 1' }));
    const layer = screen.getByTestId('gl-studio-edit-layer');
    fireEvent.pointerDown(layer, { button: 0, pointerId: 1, ...at(30, 30) });

    // Two pointer moves land in each frame, as on a 120Hz pointer and 60Hz display.
    const frames = manualFrames();
    rec.start();
    const perFrame: number[] = [];
    try {
      for (let i = 1; i <= 60; i++) {
        if (i % 2 === 1) stageRenders.count = 0;
        fireEvent.pointerMove(layer, {
          pointerId: 1,
          ctrlKey: true,
          ...at(30 + i * 0.5, 30 + i * 0.25),
        });
        if (i % 2 === 0) {
          frames.step();
          perFrame.push(stageRenders.count);
        }
      }
      fireEvent.pointerUp(layer, {
        pointerId: 1,
        ctrlKey: true,
        ...at(60, 45),
      });
      expect(frames.pending()).toBe(0);
    } finally {
      frames.restore();
    }
    await settle();
    const drag = rec.record('studio.dragRegion60');

    expect(perFrame).toHaveLength(30);
    expect(Math.max(...perFrame)).toBeLessThanOrEqual(1);
    // One commit per frame, plus the release and the autosave status it flips.
    expect(drag.commits).toBeLessThanOrEqual(33);

    const left = () => screen.getByTestId('gl-studio-selection').style.left;
    const moved = left();
    const undo = () => fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    undo();
    const original = left();
    expect(original).not.toBe(moved);
    undo();
    expect(left()).toBe(original);
  }, 30000);
});

afterAll(() => {
  if (!process.env.WRITE_PERF_BASELINE) return;
  const resultsDir = resolve(process.cwd(), 'tests/perf/results');
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(
    join(resultsDir, 'studio.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        runCommand:
          'WRITE_PERF_BASELINE=1 pnpm exec vitest run --config vitest.perf.config.ts tests/perf/studioPerf.test.tsx',
        classic: CLASSIC,
        scenarios: metrics,
      },
      null,
      2
    ) + '\n'
  );
});
