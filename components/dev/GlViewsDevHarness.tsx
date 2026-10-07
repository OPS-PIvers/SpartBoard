import React, { useEffect, useState } from 'react';
import { DialogProvider } from '@/context/DialogContext';
import { AuthProvider } from '@/context/AuthContext';
import { CustomWidgetsProvider } from '@/context/CustomWidgetsContext';
import { SavedWidgetsProvider } from '@/context/SavedWidgetsContext';
import { DashboardProvider } from '@/context/DashboardContext';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { GuidedLearningPlayer } from '@/components/widgets/GuidedLearning/components/GuidedLearningPlayer';
import { GuidedLearningResults } from '@/components/widgets/GuidedLearning/components/GuidedLearningResults';
import { EngagementView } from '@/components/widgets/GuidedLearning/components/results/EngagementView';
import { QuestionInteraction } from '@/components/widgets/GuidedLearning/components/interactions/QuestionInteraction';
import { toPublicStep } from '@/hooks/useGuidedLearningSession';
import { RESUME_PREFIX } from '@/components/widgets/GuidedLearning/components/player/useResume';
import { FrameReview } from '@/components/widgets/GuidedLearning/components/recorder/FrameReview';
import type { TourRecording } from '@/components/widgets/GuidedLearning/components/recorder/useTourCapture';
import { GuidedLearningStudio } from '@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio';
import type { EngagementSummary } from '@/components/widgets/GuidedLearning/utils/progress';

// DEV-only: Guided Learning surfaces with mock data, for light/dark chrome screenshots.
const VIEWS = [
  'player',
  'question',
  'results',
  'frame-review',
  'studio',
] as const;
type View = (typeof VIEWS)[number];

const readView = (): View => {
  const q = new URLSearchParams(window.location.search).get('view');
  return (VIEWS as readonly string[]).includes(q ?? '')
    ? (q as View)
    : 'player';
};

const slideSvg = (a: string, b: string, c: string, label: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
<radialGradient id="sun" cx="0.78" cy="0.25" r="0.35"><stop offset="0" stop-color="#fff7c2" stop-opacity="0.95"/><stop offset="1" stop-color="#fff7c2" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1600" height="900" fill="url(#g)"/>
<rect width="1600" height="900" fill="url(#sun)"/>
<path d="M0 640 C 260 520 420 600 640 540 S 1080 420 1600 560 L1600 900 L0 900 Z" fill="#14532d" opacity="0.75"/>
<path d="M0 730 C 300 650 520 720 820 680 S 1300 620 1600 700 L1600 900 L0 900 Z" fill="#052e16" opacity="0.85"/>
<circle cx="480" cy="360" r="70" fill="#f97316" opacity="0.9"/>
<rect x="1020" y="470" width="220" height="140" rx="18" fill="#0ea5e9" opacity="0.9"/>
<text x="60" y="110" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff" opacity="0.92">${label}</text>
</svg>`
  )}`;

const SLIDES = [
  slideSvg('#1e3a8a', '#7c3aed', '#f472b6', 'The water cycle'),
  slideSvg('#0f766e', '#22c55e', '#facc15', 'Evaporation'),
  slideSvg('#7f1d1d', '#ea580c', '#fde047', 'Recorded frame'),
];

const now = Date.UTC(2026, 9, 7, 14, 0);

const PLAYER_STEPS: GuidedLearningStep[] = [
  {
    id: 'tip-light',
    xPct: 30,
    yPct: 40,
    imageIndex: 0,
    label: 'The sun heats the lake',
    text: 'Light tone callout: sunlight warms the surface water.',
    interactionType: 'tooltip',
    region: { shape: 'ellipse', wPct: 12, hPct: 18 },
    calloutTone: 'light',
  },
  {
    id: 'tip-dark',
    xPct: 70,
    yPct: 60,
    imageIndex: 0,
    label: 'Clouds form',
    text: 'Default (dark) callout: vapour cools and condenses.',
    interactionType: 'tooltip',
    region: { shape: 'rect', wPct: 16, hPct: 18, cornerPct: 12 },
  },
  {
    id: 'spot',
    xPct: 30,
    yPct: 40,
    imageIndex: 1,
    label: 'Look closely here',
    text: 'This is where evaporation starts.',
    interactionType: 'spotlight',
    spotlightRadius: 18,
  },
  {
    id: 'q1',
    xPct: 50,
    yPct: 50,
    imageIndex: 1,
    interactionType: 'question',
    question: {
      type: 'multiple-choice',
      text: 'What turns liquid water into vapour?',
      choices: ['Heat from the sun', 'Wind', 'Gravity', 'Moonlight'],
      correctAnswer: 'Heat from the sun',
    },
  },
  {
    id: 'q2',
    xPct: 50,
    yPct: 50,
    imageIndex: 1,
    interactionType: 'question',
    question: {
      type: 'multiple-choice',
      text: 'Where does most evaporation happen?',
      choices: ['Oceans', 'Deserts', 'Glaciers'],
      correctAnswer: 'Oceans',
    },
  },
];

const PLAYER_SET: GuidedLearningSet = {
  id: 'gl-dev-set',
  schemaVersion: 3,
  title: 'The water cycle',
  imageUrls: [SLIDES[0], SLIDES[1]],
  steps: PLAYER_STEPS,
  mode: 'structured',
  createdAt: now,
  updatedAt: now,
};

// Studio: an old step without a tone (Dark) and a new Light step on one slide.
const STUDIO_SET: GuidedLearningSet = {
  ...PLAYER_SET,
  id: 'gl-dev-studio',
  title: 'Callout tones',
  imageUrls: [SLIDES[0]],
  steps: [
    {
      id: 'old-dark',
      xPct: 28,
      yPct: 38,
      imageIndex: 0,
      label: 'Old step',
      text: 'No calloutTone stored, so it renders Dark.',
      interactionType: 'tooltip',
      region: { shape: 'ellipse', wPct: 12, hPct: 18 },
      calloutBox: { xPct: 6, yPct: 56, wPct: 30, hPct: 18 },
    },
    {
      id: 'new-light',
      xPct: 70,
      yPct: 58,
      imageIndex: 0,
      label: 'New step',
      text: 'calloutTone is light.',
      interactionType: 'tooltip',
      region: { shape: 'rect', wPct: 16, hPct: 18, cornerPct: 12 },
      calloutTone: 'light',
      calloutBox: { xPct: 56, yPct: 12, wPct: 30, hPct: 18 },
    },
  ],
};

const ENGAGEMENT: EngagementSummary = {
  viewers: 24,
  completed: 17,
  funnel: [
    { stepId: 'tip-light', reached: 24, medianMs: 6200 },
    { stepId: 'tip-dark', reached: 23, medianMs: 8100 },
    { stepId: 'spot', reached: 21, medianMs: 4300 },
    { stepId: 'q1', reached: 19, medianMs: 15800 },
    { stepId: 'q2', reached: 17, medianMs: 11200 },
  ],
  misclicksBySlide: new Map([
    [
      0,
      [
        { x: 22, y: 30, stepId: 'tip-light' },
        { x: 25, y: 46, stepId: 'tip-light' },
        { x: 62, y: 55, stepId: 'tip-dark' },
        { x: 75, y: 70, stepId: 'tip-dark' },
        { x: 78, y: 52, stepId: 'tip-dark' },
      ],
    ],
    [
      1,
      [
        { x: 40, y: 35, stepId: 'spot' },
        { x: 35, y: 50, stepId: 'spot' },
      ],
    ],
  ]),
};

const drawFrame = (src: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      canvas.getContext('2d')?.drawImage(img, 0, 0, 1280, 720);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))));
    };
    img.onerror = () => reject(new Error('frame image'));
    img.src = src;
  });

const recordedStep = (
  id: string,
  frameIndex: number,
  anchor: string,
  untagged = false
): TourRecording['steps'][number] => ({
  id,
  frameIndex,
  untagged,
  xPct: 40,
  yPct: 45,
  region: { shape: 'rect', wPct: 10, hPct: 8 },
  tour: { anchor, action: 'click' },
});

const useRecording = (): TourRecording | null => {
  const [recording, setRecording] = useState<TourRecording | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(SLIDES.map(drawFrame)).then((frames) => {
      if (cancelled) return;
      setRecording({
        frames,
        redactions: [[{ xPct: 70, yPct: 6, wPct: 22, hPct: 7 }], [], []],
        steps: [
          recordedStep('r1', 0, 'dock.item:time-tool'),
          recordedStep('r2', 1, 'widget.settings-opener'),
          recordedStep('r3', 2, '', true),
        ],
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return recording;
};

const noop = () => undefined;
const resolved = () => Promise.resolve();

const fill = 'absolute inset-0 [container-type:size]';

// Drops the saved place first so no Resume prompt covers the step.
const FreshPlayer: React.FC<{ start: string }> = ({ start }) => {
  useState(() => {
    try {
      window.localStorage.removeItem(RESUME_PREFIX + PLAYER_SET.id);
    } catch {
      // storage blocked: the prompt may show
    }
    return null;
  });
  return (
    <GuidedLearningPlayer
      set={PLAYER_SET}
      teacherMode
      playerV2
      startStepId={start}
      onClose={noop}
    />
  );
};

const PlayerView: React.FC<{ start: string }> = ({ start }) => (
  <div className={`${fill} bg-slate-950`}>
    <FreshPlayer key={start} start={start} />
  </div>
);

const QuestionView: React.FC = () => {
  const question = toPublicStep(PLAYER_STEPS[3]);
  return (
    <div className={`${fill} bg-slate-950`}>
      <FreshPlayer start="spot" />
      <div
        className={`${fill} z-30 pointer-events-auto`}
        data-testid="gl-dev-question-overlay"
      >
        <QuestionInteraction
          step={question}
          onAnswer={noop}
          onContinue={noop}
          correctAnswer={PLAYER_STEPS[3].question?.correctAnswer}
        />
      </div>
    </div>
  );
};

const ResultsView: React.FC = () => (
  <div className="absolute inset-0 grid grid-cols-1 lg:grid-cols-2">
    <div className="relative [container-type:size] border-r border-slate-200">
      <GuidedLearningResults
        set={PLAYER_SET}
        sessionId="gl-dev-session"
        onClose={noop}
      />
    </div>
    <div
      className="relative [container-type:size] overflow-y-auto bg-slate-50 text-slate-900"
      style={{ padding: 'min(12px, 2.5cqmin)' }}
    >
      <EngagementView set={PLAYER_SET} summary={ENGAGEMENT} failed={false} />
    </div>
  </div>
);

const FrameReviewView: React.FC = () => {
  const recording = useRecording();
  return (
    <div className="absolute inset-0 bg-slate-700">
      {recording ? (
        <FrameReview recording={recording} onUpload={noop} onDiscard={noop} />
      ) : (
        <p className="p-6 text-white">Drawing frames…</p>
      )}
    </div>
  );
};

const StudioView: React.FC<{ step: string }> = ({ step }) => (
  <GuidedLearningStudio
    key={step}
    set={STUDIO_SET}
    meta={null}
    onClose={noop}
    onSave={resolved}
    initialStepId={step}
  />
);

export const GlViewsDevHarness: React.FC = () => {
  const [view, setView] = useState<View>(readView);
  const [tone, setTone] = useState<'tip-light' | 'tip-dark'>('tip-light');
  const [studioStep, setStudioStep] = useState<'old-dark' | 'new-light'>(
    'new-light'
  );
  const [hidden, setHidden] = useState(false);

  if (import.meta.env.VITE_AUTH_BYPASS !== 'true') {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Set <code className="mx-1 font-mono">VITE_AUTH_BYPASS=true</code> to use
        this harness.
      </div>
    );
  }

  const pick = (next: View) => {
    setView(next);
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  };

  const btn = (active: boolean) =>
    `rounded px-2 py-0.5 ${active ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`;

  return (
    <DialogProvider>
      <AuthProvider>
        <CustomWidgetsProvider>
          <SavedWidgetsProvider>
            <DashboardProvider>
              <div className="fixed inset-0 overflow-hidden bg-slate-900 font-sans">
                {view === 'player' && <PlayerView start={tone} />}
                {view === 'question' && <QuestionView />}
                {view === 'results' && <ResultsView />}
                {view === 'frame-review' && <FrameReviewView />}
                {view === 'studio' && <StudioView step={studioStep} />}
              </div>
              <div
                className={`fixed right-0 top-1/2 z-[2147483000] flex -translate-y-1/2 flex-col items-stretch gap-0.5 rounded-l-lg bg-white/95 p-1 text-xs text-slate-700 shadow ${hidden ? 'opacity-0 hover:opacity-100' : ''}`}
              >
                <button
                  type="button"
                  data-testid="gl-dev-hide-switcher"
                  onClick={() => setHidden((h) => !h)}
                  className={btn(false)}
                >
                  {hidden ? 'show' : 'hide'}
                </button>
                {!hidden &&
                  VIEWS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      data-testid={`gl-dev-view-${v}`}
                      onClick={() => pick(v)}
                      className={btn(view === v)}
                    >
                      {v}
                    </button>
                  ))}
                {!hidden && view === 'player' && (
                  <>
                    <hr className="my-0.5 border-slate-200" />
                    <button
                      type="button"
                      data-testid="gl-dev-step-light"
                      onClick={() => setTone('tip-light')}
                      className={btn(tone === 'tip-light')}
                    >
                      light tip
                    </button>
                    <button
                      type="button"
                      data-testid="gl-dev-step-dark"
                      onClick={() => setTone('tip-dark')}
                      className={btn(tone === 'tip-dark')}
                    >
                      dark tip
                    </button>
                  </>
                )}
                {!hidden && view === 'studio' && (
                  <>
                    <hr className="my-0.5 border-slate-200" />
                    <button
                      type="button"
                      data-testid="gl-dev-studio-old"
                      onClick={() => setStudioStep('old-dark')}
                      className={btn(studioStep === 'old-dark')}
                    >
                      old step
                    </button>
                    <button
                      type="button"
                      data-testid="gl-dev-studio-new"
                      onClick={() => setStudioStep('new-light')}
                      className={btn(studioStep === 'new-light')}
                    >
                      new step
                    </button>
                  </>
                )}
              </div>
            </DashboardProvider>
          </SavedWidgetsProvider>
        </CustomWidgetsProvider>
      </AuthProvider>
    </DialogProvider>
  );
};
