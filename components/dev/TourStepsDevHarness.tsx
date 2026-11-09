// The Steps view on seeded tours with drawn pictures, for screenshots. Dev builds only; reads nothing from any backend.
import React, { useEffect, useMemo, useState } from 'react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { StepsView, type StepsMode } from '@/components/tours/steps/StepsView';
import { StepsWalkthrough } from '@/components/tours/steps/StepsWalkthrough';
import { stepsFromLiveTour } from '@/components/tours/steps/liveSteps';
import {
  stepsFromWebTour,
  type StepPictures,
} from '@/components/tours/steps/stepsModel';
import { useStepsLabels } from '@/components/tours/steps/useStepsLabels';
import { renderStepText } from '@/components/widgets/GuidedLearning/utils/richText';
import type { WebTourStep } from '@/components/widgets/GuidedLearning/utils/liveTour';

type Box = { x: number; y: number; w: number; h: number };

interface Fixture {
  title: string;
  text: string;
  action: 'click' | 'observe' | 'type';
  name: string;
  box: Box;
  /** Shown only on some boards or pages. */
  only?: boolean;
  /** No picture at all. */
  bare?: boolean;
  /** The picture fails to load. */
  broken?: boolean;
  /** Picture with no place for the target (older recordings). */
  unplaced?: boolean;
}

const WEB: Fixture[] = [
  {
    title: 'Open Add Materials',
    text: 'Every handout, link and quiz for this course starts here.',
    action: 'click',
    name: 'Add Materials',
    box: { x: 0.43, y: 0.2, w: 0.1, h: 0.045 },
  },
  {
    title: 'Choose Add File',
    text: 'Pick a file from your computer or Google Drive.',
    action: 'click',
    name: 'Add File',
    box: { x: 0.43, y: 0.27, w: 0.12, h: 0.04 },
  },
  {
    title:
      'Allow pop-ups for this site, then pick the file you want students to open first in a course that already has many materials',
    text: 'If a banner asks you to allow pop-ups, choose Allow. Chrome remembers this for the site, so you only do it once. Long tips wrap onto as many lines as they need and never push the picture off the page.',
    action: 'observe',
    name: 'Banner',
    box: { x: 0.2, y: 0.12, w: 0.55, h: 0.07 },
    only: true,
  },
  {
    title: 'Name the material',
    text: 'Students see this name in the course list.',
    action: 'type',
    name: 'Title',
    box: { x: 0.38, y: 0.42, w: 0.28, h: 0.045 },
    unplaced: true,
  },
  {
    title: 'Add a due date',
    text: 'Optional. Skip it for reference material.',
    action: 'click',
    name: 'Due date',
    box: { x: 0.38, y: 0.5, w: 0.2, h: 0.045 },
    bare: true,
  },
  {
    title: 'Check the preview',
    text: 'The preview matches what students see.',
    action: 'click',
    name: 'Preview',
    box: { x: 0.2, y: 0.6, w: 0.3, h: 0.2 },
    broken: true,
  },
  {
    title: 'Find it in the list',
    text: 'New materials appear at the top.',
    action: 'observe',
    name: 'Materials',
    box: { x: 0.2, y: 0.55, w: 0.55, h: 0.3 },
  },
];

const LIVE: Fixture[] = [
  {
    title: 'Open the Dock',
    text: 'Every tool lives here. **Tap the arrow** to open it.',
    action: 'click',
    name: 'Dock',
    box: { x: 0.35, y: 0.88, w: 0.3, h: 0.1 },
  },
  {
    title: 'Pick the Timer',
    text: 'It opens on your board right away.',
    action: 'click',
    name: 'Timer',
    box: { x: 0.45, y: 0.5, w: 0.1, h: 0.12 },
  },
  {
    title: 'Set the minutes',
    text: 'Type a number or use the arrows.',
    action: 'type',
    name: 'Minutes',
    box: { x: 0.3, y: 0.3, w: 0.2, h: 0.1 },
    only: true,
    unplaced: true,
  },
  {
    title: 'Start the timer',
    text: 'Students see the countdown from across the room.',
    action: 'click',
    name: 'Start',
    box: { x: 0.55, y: 0.6, w: 0.12, h: 0.08 },
    bare: true,
  },
];

const VW = 1440;
const VH = 900;

const cropOf = (box: Box) => {
  const tw = box.w * VW;
  const th = box.h * VH;
  const w = Math.min(Math.max(tw + 400, 640), VW);
  const h = Math.min(Math.max(th + 400, 360), VH);
  const clamp = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);
  return {
    x: clamp(box.x * VW + tw / 2 - w / 2, VW - w),
    y: clamp(box.y * VH + th / 2 - h / 2, VH - h),
    w,
    h,
  };
};

const placedIn = (box: Box) => {
  const c = cropOf(box);
  return {
    target: {
      x: (box.x * VW - c.x) / c.w,
      y: (box.y * VH - c.y) / c.h,
      w: (box.w * VW) / c.w,
      h: (box.h * VH) / c.h,
    },
    cssW: c.w,
    w: 1280,
    h: Math.round((1280 * c.h) / c.w),
  };
};

const draw = (kind: 'web' | 'live', f: Fixture): Promise<Blob> => {
  const crop = cropOf(f.box);
  const out = document.createElement('canvas');
  out.width = 1280;
  out.height = Math.round((1280 * crop.h) / crop.w);
  const ctx = out.getContext('2d');
  if (!ctx) return Promise.reject(new Error('No canvas'));
  ctx.scale(out.width / crop.w, out.width / crop.w);
  ctx.translate(-crop.x, -crop.y);
  if (kind === 'web') {
    ctx.fillStyle = '#f4f6f9';
    ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#1f3a5f';
    ctx.fillRect(0, 0, VW, 56);
    ctx.fillStyle = '#e7ebf1';
    ctx.fillRect(0, 56, 240, VH - 56);
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 28px sans-serif';
    ctx.fillText('Biology 7: Materials', 280, 120);
  } else {
    const g = ctx.createLinearGradient(0, 0, VW, VH);
    g.addColorStop(0, '#312e81');
    g.addColorStop(1, '#0f766e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(120, 120, 420, 300);
    ctx.fillRect(900, 160, 360, 260);
  }
  ctx.fillStyle = kind === 'web' ? '#2563eb' : '#ffffff';
  ctx.beginPath();
  ctx.roundRect(f.box.x * VW, f.box.y * VH, f.box.w * VW, f.box.h * VH, 8);
  ctx.fill();
  ctx.fillStyle = kind === 'web' ? '#ffffff' : '#1e1b4b';
  ctx.font = '600 18px sans-serif';
  ctx.fillText(
    f.name,
    f.box.x * VW + 14,
    f.box.y * VH + (f.box.h * VH) / 2 + 6
  );
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('No blob'))))
  );
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(r.error ?? new Error('Could not read'));
    r.readAsDataURL(blob);
  });

const many = (list: Fixture[]): Fixture[] =>
  Array.from({ length: 14 }, (_, i) => {
    const base = list[i % list.length];
    return {
      ...base,
      title: `${i + 1}. ${base.title}`,
      only: i === 5,
      bare: false,
      broken: false,
    };
  });

const stepId = (kind: string, i: number) => `${kind}-${i}`;

const webTour = (list: Fixture[]): WebTourStep[] =>
  list.map(
    (f, i) =>
      ({
        id: stepId('web', i),
        xPct: 50,
        yPct: 50,
        imageIndex: 0,
        interactionType: 'tooltip',
        label: f.title,
        text: f.text,
        web: {
          urlPattern: 'https://learning.example.org/course/*/materials',
          action: f.action,
          locator: {
            role: 'button',
            name: f.name,
            ...(f.unplaced ? {} : { box: f.box }),
          },
          ...(f.only ? { showWhen: [{ kind: 'present' }] } : {}),
          ...(f.bare
            ? {}
            : {
                picture: {
                  path: `p/${i}`,
                  ...placedIn(f.box),
                  ...(f.unplaced ? { target: undefined, cssW: undefined } : {}),
                },
              }),
        },
      }) as unknown as WebTourStep
  );

const liveSet = (
  list: Fixture[],
  urls: Record<string, string>
): GuidedLearningSet => ({
  id: 'live-dev',
  title: 'Run a timer',
  imageUrls: [],
  mode: 'tour',
  createdAt: 1,
  updatedAt: 1,
  steps: list.map((f, i): GuidedLearningStep => {
    const id = stepId('live', i);
    const p = placedIn(f.box);
    return {
      id,
      xPct: 50,
      yPct: 50,
      imageIndex: 0,
      interactionType: 'tooltip',
      label: f.title,
      text: f.text,
      tour: {
        anchor: `dock.step-${i}`,
        action: f.action === 'observe' ? 'observe' : 'click',
        ...(f.only
          ? { showWhen: [{ kind: 'widget-open', type: 'timer' }] }
          : {}),
        ...(f.bare || !urls[id]
          ? {}
          : {
              thumbnail: {
                url: urls[id],
                anchor: `dock.step-${i}`,
                w: p.w,
                h: p.h,
                ...(f.unplaced ? {} : { target: p.target }),
              },
            }),
      },
    } as unknown as GuidedLearningStep;
  }),
});

const param = (name: string) =>
  new URLSearchParams(window.location.search).get(name);

export const TourStepsDevHarness: React.FC = () => {
  const kind = param('kind') === 'live' ? 'live' : 'web';
  const state = param('state') ?? 'normal';
  const mode: StepsMode = param('mode') === 'walk' ? 'walkthrough' : 'steps';
  const crowded = param('many') === '1';
  const labels = useStepsLabels();
  const fixtures = useMemo(() => {
    const base = kind === 'web' ? WEB : LIVE;
    return crowded ? many(base) : base;
  }, [kind, crowded]);
  const [urls, setUrls] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      fixtures.map(async (f, i): Promise<[string, string]> => [
        stepId(kind, i),
        await blobToDataUrl(await draw(kind, f)),
      ])
    ).then((entries) => {
      if (!cancelled) setUrls(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [fixtures, kind]);

  const view = useMemo(() => {
    if (kind === 'web') {
      const steps = stepsFromWebTour(webTour(fixtures));
      return { steps, text: undefined };
    }
    return {
      steps: stepsFromLiveTour(liveSet(fixtures, urls ?? {})).steps,
      text: renderStepText,
    };
  }, [kind, fixtures, urls]);

  const pictures = useMemo<StepPictures>(() => {
    const out: Record<string, StepPictures[string]> = {};
    view.steps.forEach((s, i) => {
      if (!s.picture) return;
      const f = fixtures[i];
      const src = urls?.[s.id];
      out[s.id] =
        state === 'loading' || !src
          ? { status: 'loading' }
          : f.broken || state === 'failed'
            ? { status: 'failed' }
            : { status: 'ready', src };
    });
    return out;
  }, [view, fixtures, urls, state]);

  const steps =
    state === 'empty' || state === 'loading-steps' ? [] : view.steps;
  return (
    <main className="h-screen [height:100dvh] overflow-y-auto bg-white px-4 py-10 pb-16">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {kind === 'web' ? 'Web tour' : 'Live tour'}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {kind === 'web' ? 'Post materials to a course' : 'Run a timer'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {kind === 'web' ? 'On learning.example.org · ' : ''}
          {steps.length} steps
        </p>
        <div className="mt-8">
          <StepsView
            key={`${kind}-${mode}-${crowded}`}
            steps={steps}
            pictures={pictures}
            labels={labels}
            loading={state === 'loading-steps'}
            walkthrough={StepsWalkthrough}
            initialMode={mode}
            renderText={view.text}
            print={{
              title:
                kind === 'web' ? 'Post materials to a course' : 'Run a timer',
            }}
          />
        </div>
      </div>
    </main>
  );
};
