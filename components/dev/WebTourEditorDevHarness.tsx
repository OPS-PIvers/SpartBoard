// The web tour editor on a seeded tour with drawn pictures, for screenshots. Dev builds with auth bypass only.
import React, { useEffect, useState } from 'react';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  WebTourCheckResult,
} from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { DashboardContext } from '@/context/DashboardContextValue';
import { WebTourEditor } from '@/components/tours/web/WebTourEditor';
import { targetsSignature } from '@/components/tours/web/webStepReview';
import { recordCheckSuggestion } from '@/components/tours/web/webTourFixes';
import { ASSUMED_VIEWPORT } from '@/components/tours/web/pictureTarget';
import type { WebTourEditorDevSeed } from '@/components/tours/web/webEditorDevSeed';
import { pictureFingerprint } from '@/components/tours/publicLink/publicLinkModel';
import type { PublicLinkDevSeed } from '@/components/tours/publicLink/publicLinkStore';

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

const STATES = [
  'write',
  'check',
  'checking',
  'publish',
  'published',
  'noext',
  'failed',
  'fix',
  'question',
  'student',
  'pictures',
  'legacy',
  'tools',
  'older',
  'conditions',
] as const;
type State = (typeof STATES)[number];

const pathOf = (f: Fixture) =>
  `web_tour_pictures/web-tour-editor-dev/${f.id}.png`;
const fullPathOf = (f: Fixture) =>
  `web_tour_pictures/web-tour-editor-dev/${f.id}-full.png`;
const FULL_W = 1600;
const FULL_H = Math.round((FULL_W * VH) / VW);

/** Each step's whole screen, as the recorder now keeps it beside the crop. */
const drawFull = async (f: Fixture, all: Fixture[]): Promise<Blob> => {
  const out = document.createElement('canvas');
  out.width = FULL_W;
  out.height = FULL_H;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.scale(FULL_W / VW, FULL_H / VH);
  drawPage(ctx);
  for (const g of all.slice(0, all.indexOf(f) + 1)) drawTarget(ctx, g);
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('No blob'))))
  );
};

/** The target's place in its crop, as the recorder stores it. */
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
  };
};

const stepOf = (f: Fixture, state: State, i: number): GuidedLearningStep => {
  const c = cropOf(f.box);
  const h = Math.round((1280 * c.h) / c.w);
  const legacy = state === 'legacy';
  // Recorded in a window of another shape: its estimate fails the checks.
  const odd = legacy && i === 1;
  const blank = state === 'write' && i >= 2;
  const text =
    state === 'student' && i === 0
      ? 'Ask Avery Lindqvist to open the course first.'
      : f.text;
  return {
    id: f.id,
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'tooltip',
    label: blank ? '' : f.label,
    text: blank ? '' : text,
    web: {
      urlPattern: 'https://learning.example.org/course/*/materials',
      action: f.action,
      locator: { role: f.role, name: f.name, box: f.box },
      ...(state === 'question' && i === 2
        ? { claudeQuestion: 'Does the title have to match the file name?' }
        : {}),
      ...(state === 'conditions' && i === 1
        ? { showWhen: { kind: 'target' as const } }
        : {}),
      ...(state === 'conditions' && i === 2
        ? {
            showWhen: {
              kind: 'url' as const,
              pattern: 'https://other.example.org/admin/*',
            },
          }
        : {}),
      ...(state === 'conditions' && i === 3
        ? {
            doneWhen: {
              kind: 'url' as const,
              pattern: 'https://learning.example.org/course/*/materials/new',
            },
          }
        : {}),
      ...(state === 'pictures' && i === 1
        ? {}
        : {
            picture: {
              path:
                state === 'pictures' && i === 2
                  ? 'web_tour_pictures/web-tour-editor-dev/missing.png'
                  : pathOf(f),
              w: 1280,
              h: odd ? 720 : h,
              ...(legacy ? {} : placedIn(f.box)),
              ...(state === 'tools' || state === 'conditions'
                ? {
                    original: {
                      path: fullPathOf(f),
                      w: FULL_W,
                      h: FULL_H,
                      crop: {
                        x: c.x / VW,
                        y: c.y / VH,
                        w: c.w / VW,
                        h: c.h / VH,
                      },
                    },
                  }
                : {}),
            },
          }),
    },
  };
};

const checkedRun = (
  set: GuidedLearningSet,
  results: Record<string, WebTourCheckResult> = {}
): GuidedLearningSet => ({
  ...set,
  webTourChecked: {
    by: 'mock-user-id',
    at: 1,
    sig: targetsSignature(set),
    results: Object.fromEntries(
      set.steps.map((s) => [s.id, results[s.id] ?? 'found'])
    ),
  },
});

// With `?public=`, two steps carry markup so the confirm shows it at full size.
const withMarkup = (
  step: GuidedLearningStep,
  i: number
): GuidedLearningStep => {
  const pic = step.web?.picture;
  if (
    !step.web ||
    !pic ||
    !new URLSearchParams(window.location.search).has('public')
  )
    return step;
  const shapes: NonNullable<typeof pic.markup> =
    i === 0
      ? [
          { id: 'a1', kind: 'arrow', x1: 0.2, y1: 0.75, x2: 0.36, y2: 0.62 },
          { id: 'n1', kind: 'number', x: 0.16, y: 0.8, n: 1 },
        ]
      : i === 2
        ? [{ id: 'b1', kind: 'box', x: 0.33, y: 0.42, w: 0.36, h: 0.2 }]
        : [];
  return shapes.length
    ? { ...step, web: { ...step.web, picture: { ...pic, markup: shapes } } }
    : step;
};

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
    steps: FIXTURES.map((f, i) => withMarkup(stepOf(f, state, i), i)),
  };
  switch (state) {
    case 'publish':
    case 'published':
    case 'student':
    case 'question':
    case 'legacy':
    case 'tools':
    case 'older':
    case 'conditions':
      return checkedRun(set);
    case 'failed':
      return checkedRun(set, { f2: 'none', f3: 'weak' });
    case 'fix': {
      const run = checkedRun(set, { f2: 'weak' });
      return recordCheckSuggestion(
        run,
        targetsSignature(run),
        'f2',
        { role: 'menuitem', name: 'Add File or Link' },
        2
      );
    }
    default:
      return set;
  }
};

const ready: WebTourEditorDevSeed = {
  publish: 'draft',
  canCheck: true,
  canFix: true,
};

const SEEDS: Record<State, WebTourEditorDevSeed> = {
  write: {
    ...ready,
    // Claude fills the blanks and asks about one step.
    writing: (requests) => ({
      steps: requests.map((r) =>
        r.id === 'f4'
          ? { id: r.id, question: 'Is the newest material always on top?' }
          : {
              id: r.id,
              title: 'Name the material',
              tip: 'Students see this name in the course list.',
            }
      ),
      failed: [],
    }),
  },
  check: ready,
  checking: { ...ready, checking: true },
  publish: { ...ready, publish: 'changed' },
  published: { ...ready, publish: 'published' },
  noext: { ...ready, canCheck: false, canFix: false },
  failed: ready,
  fix: ready,
  question: ready,
  student: { ...ready, publish: 'changed' },
  pictures: ready,
  legacy: { ...ready, publish: 'changed' },
  // Publish state follows the seeded published copy, so edits show as changes.
  tools: { canCheck: true, canFix: true },
  older: { canCheck: true, canFix: true },
  conditions: { ...ready, publish: 'changed' },
};

// One roster, so the student-name scan runs as it does for a teacher with classes.
const dashboard = {
  rosters: [{ students: [{ firstName: 'Avery', lastName: 'Lindqvist' }] }],
} as unknown as React.ContextType<typeof DashboardContext>;

const auth = {
  user: { uid: 'mock-user-id', email: 'admin@example.com' },
  isAdmin: true,
  canAccessFeature: () => true,
} as unknown as AuthContextType;

const PUBLIC_STATES = [
  'off',
  'on',
  'paused',
  'confirmer',
  'unpublished',
  'author',
] as const;
const DEV_TOKEN = '5f0c2a9e7b1d4e38a6c09d2b71e4f8a3';

/** `?public=` seeds the public-link switch: off, on, paused (a picture changed after the confirm), unpublished, or author (not an admin). */
const publicSeed = (
  tour: GuidedLearningSet,
  pictures: Record<string, Blob>
): PublicLinkDevSeed => {
  const named = new URLSearchParams(window.location.search).get('public');
  const mode = (PUBLIC_STATES as readonly string[]).includes(named ?? '')
    ? (named as (typeof PUBLIC_STATES)[number])
    : 'off';
  const record = {
    token: DEV_TOKEN,
    fingerprint: pictureFingerprint(tour) ?? '',
    kind: 'web' as const,
    confirmedBy: 'admin@example.com',
    confirmedAt: 1,
    pictures: {},
  };
  // A retake published after the confirm: step 1 now points at a new file.
  const retaken: GuidedLearningSet = {
    ...tour,
    steps: tour.steps.map((s, i) =>
      i === 0 && s.web?.picture
        ? {
            ...s,
            web: {
              ...s.web,
              picture: {
                ...s.web.picture,
                path: `${s.web.picture.path}-retake`,
              },
            },
          }
        : s
    ),
  };
  const firstPath = tour.steps[0]?.web?.picture?.path ?? '';
  return {
    admin: mode !== 'author',
    records: {
      [tour.id]:
        mode === 'on'
          ? record
          : mode === 'paused'
            ? { ...record, off: { reason: 'pictures', at: 2 } }
            : mode === 'confirmer'
              ? { ...record, off: { reason: 'confirmer', at: 2 } }
              : null,
    },
    published: {
      [tour.id]:
        mode === 'unpublished' ? null : mode === 'paused' ? retaken : tour,
    },
    pictures: { ...pictures, [`${firstPath}-retake`]: pictures[firstPath] },
  };
};

export const WebTourEditorDevHarness: React.FC = () => {
  const [state] = useState<State>(() => {
    const named = new URLSearchParams(window.location.search).get('state');
    return (STATES as readonly string[]).includes(named ?? '')
      ? (named as State)
      : 'check';
  });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      ...FIXTURES.map((f) => drawPicture(f, FIXTURES)),
      ...FIXTURES.map((f) => drawFull(f, FIXTURES)),
    ]).then((blobs) => {
      if (cancelled) return;
      const pictures: Record<string, Blob> = {};
      FIXTURES.forEach((f, i) => {
        pictures[pathOf(f)] = blobs[i];
        pictures[fullPathOf(f)] = blobs[FIXTURES.length + i];
      });
      // Offline: crops, blurs and uploads land in this page's own store.
      window.__webTourEditorDevSeed = {
        ...SEEDS[state],
        pictures,
        offline: true,
        publishedSet: tourFor(state),
      };
      window.__publicLinkDevSeed = publicSeed(tourFor(state), pictures);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);
  if (!loaded) return null;
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
