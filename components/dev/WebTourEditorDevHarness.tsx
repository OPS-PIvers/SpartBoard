// The web tour editor on a seeded tour with drawn pictures, for screenshots. Dev builds with auth bypass only.
import React, { useEffect, useState } from 'react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { DashboardContext } from '@/context/DashboardContextValue';
import { WebTourEditor } from '@/components/tours/web/WebTourEditor';
import { targetsSignature } from '@/components/tours/web/webStepReview';
import { ASSUMED_VIEWPORT } from '@/components/tours/web/pictureTarget';
import type { WebTourEditorDevSeed } from '@/components/tours/web/webEditorDevSeed';

type Box = { x: number; y: number; w: number; h: number };

interface Fixture {
  id: string;
  label: string;
  text: string;
  action: 'click' | 'type' | 'observe';
  name: string;
  role: string;
  box: Box;
}

const FIXTURES: Fixture[] = [
  {
    id: 'f1',
    label: 'Open Add Materials',
    text: 'Every handout, link and quiz for this course starts here.',
    action: 'click',
    name: 'Add Materials',
    role: 'button',
    box: { x: 0.43, y: 0.2, w: 0.1, h: 0.045 },
  },
  {
    id: 'f2',
    label: 'Choose Add File',
    text: 'Pick a file from your computer or Google Drive.',
    action: 'click',
    name: 'Add File',
    role: 'menuitem',
    box: { x: 0.43, y: 0.27, w: 0.12, h: 0.04 },
  },
  {
    id: 'f3',
    label: 'Name the material',
    text: 'Students see this name in the course list.',
    action: 'type',
    name: 'Title',
    role: 'textbox',
    box: { x: 0.38, y: 0.42, w: 0.28, h: 0.045 },
  },
  {
    id: 'f4',
    label: 'Find it in the list',
    text: 'New materials appear at the top.',
    action: 'observe',
    name: 'Materials',
    role: 'list',
    box: { x: 0.2, y: 0.55, w: 0.55, h: 0.3 },
  },
];

const VW = ASSUMED_VIEWPORT.w;
const VH = ASSUMED_VIEWPORT.h;

/** The recorder's crop around `box`, in viewport pixels. */
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

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** A plain course page, drawn at viewport size. */
const drawPage = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = '#f4f6f9';
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = '#1f3a5f';
  ctx.fillRect(0, 0, VW, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 20px sans-serif';
  ctx.fillText('Learning site', 24, 36);
  ctx.font = '15px sans-serif';
  ['Courses', 'Groups', 'Resources', 'Grades'].forEach((t, i) =>
    ctx.fillText(t, 260 + i * 120, 35)
  );
  ctx.fillStyle = '#e7ebf1';
  ctx.fillRect(0, 56, 240, VH - 56);
  ctx.fillStyle = '#334155';
  ctx.font = '15px sans-serif';
  ['Materials', 'Updates', 'Gradebook', 'Attendance', 'Members'].forEach(
    (t, i) => ctx.fillText(t, 28, 110 + i * 40)
  );
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 28px sans-serif';
  ctx.fillText('Biology 7: Materials', 280, 120);
};

const drawTarget = (ctx: CanvasRenderingContext2D, f: Fixture) => {
  const x = f.box.x * VW;
  const y = f.box.y * VH;
  const w = f.box.w * VW;
  const h = f.box.h * VH;
  if (f.role === 'list') {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ['Cell diagram (PDF)', 'Lab safety video', 'Unit 3 vocabulary'].forEach(
      (t, i) => {
        ctx.fillStyle = '#334155';
        ctx.font = '16px sans-serif';
        ctx.fillText(t, x + 20, y + 40 + i * 60);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(x + 12, y + 60 + i * 60, w - 24, 1);
      }
    );
    return;
  }
  if (f.role === 'textbox') {
    ctx.fillStyle = '#475569';
    ctx.font = '14px sans-serif';
    ctx.fillText('Title', x, y - 10);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#94a3b8';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.fillStyle = f.role === 'button' ? '#2563eb' : '#ffffff';
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = f.role === 'button' ? '#ffffff' : '#0f172a';
  ctx.font = '600 16px sans-serif';
  ctx.fillText(f.name, x + 16, y + h / 2 + 6);
};

/** Each step's picture: the page cropped around its target, as the recorder crops it. */
const drawPicture = async (f: Fixture, all: Fixture[]): Promise<Blob> => {
  const crop = cropOf(f.box);
  const out = document.createElement('canvas');
  out.width = 1280;
  out.height = Math.round((1280 * crop.h) / crop.w);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  const scale = out.width / crop.w;
  ctx.scale(scale, scale);
  ctx.translate(-crop.x, -crop.y);
  drawPage(ctx);
  // Steps up to this one are on the page by now.
  for (const g of all.slice(0, all.indexOf(f) + 1)) drawTarget(ctx, g);
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('No blob'))))
  );
};

type State = 'write' | 'check' | 'checking' | 'publish' | 'published';

const stepOf = (f: Fixture, state: State, i: number): GuidedLearningStep => ({
  id: f.id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  // Write text: the last steps still have nothing written.
  label: state === 'write' && i >= 2 ? '' : f.label,
  text: state === 'write' && i >= 2 ? '' : f.text,
  web: {
    urlPattern: 'https://learning.example.org/course/*/materials',
    action: f.action,
    locator: { role: f.role, name: f.name, box: f.box },
    picture: {
      path: `web_tour_pictures/dev/${f.id}.png`,
      w: 1280,
      h: Math.round((1280 * cropOf(f.box).h) / cropOf(f.box).w),
    },
  },
});

const tourFor = (state: State): GuidedLearningSet => {
  const set: GuidedLearningSet = {
    id: 'web-tour-editor-dev',
    title: 'Post materials to a course',
    imageUrls: [],
    mode: 'tour',
    surface: 'web',
    createdAt: 1,
    updatedAt: 1,
    webGoal: 'Adding a handout to a course page',
    steps: FIXTURES.map((f, i) => stepOf(f, state, i)),
  };
  if (state !== 'publish' && state !== 'published') return set;
  return {
    ...set,
    webTourChecked: {
      by: 'mock-user-id',
      at: 1,
      sig: targetsSignature(set),
      results: Object.fromEntries(set.steps.map((s) => [s.id, 'found'])),
    },
  };
};

const SEEDS: Record<State, WebTourEditorDevSeed> = {
  write: { publish: 'draft', canCheck: true, canFix: true },
  check: { publish: 'draft', canCheck: true, canFix: true },
  checking: { publish: 'draft', canCheck: true, canFix: true, checking: true },
  publish: { publish: 'changed', canCheck: true, canFix: true },
  published: { publish: 'published', canCheck: true, canFix: true },
};

// One roster, so the student-name scan runs as it does for a teacher with classes.
const dashboard = {
  rosters: [{ students: [{ firstName: 'Avery', lastName: 'Lindqvist' }] }],
} as unknown as React.ContextType<typeof DashboardContext>;

const auth = { user: { uid: 'mock-user-id' } } as unknown as AuthContextType;

export const WebTourEditorDevHarness: React.FC = () => {
  const [state] = useState<State>(() => {
    const named = new URLSearchParams(window.location.search).get('state');
    return named && named in SEEDS ? (named as State) : 'check';
  });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(FIXTURES.map((f) => drawPicture(f, FIXTURES))).then(
      (blobs) => {
        if (cancelled) return;
        const pictures: Record<string, Blob> = {};
        FIXTURES.forEach((f, i) => {
          pictures[`web_tour_pictures/dev/${f.id}.png`] = blobs[i];
        });
        window.__webTourEditorDevSeed = { ...SEEDS[state], pictures };
        setReady(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [state]);
  if (!ready) return null;
  return (
    <AuthContext.Provider value={auth}>
      <DashboardContext.Provider value={dashboard}>
        <DialogProvider>
          <div className="h-screen bg-slate-200" />
          <WebTourEditor initial={tourFor(state)} onClose={() => undefined} />
        </DialogProvider>
      </DashboardContext.Provider>
    </AuthContext.Provider>
  );
};
