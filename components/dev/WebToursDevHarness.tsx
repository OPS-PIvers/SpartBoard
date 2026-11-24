// The Web tours page on seeded tours, for screenshots. Dev builds with auth bypass only.
import React from 'react';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  WebTourCheckResult,
} from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { WebToursPage } from '@/components/tours/web/WebToursPage';
import { targetsSignature } from '@/components/tours/web/webStepReview';
import type { WebToursDevSeed } from '@/components/tours/web/webToursDevSeed';
import { pictureFingerprint } from '@/components/tours/publicLink/publicLinkModel';
import type { TourRun } from '@/components/tours/tourRuns';

interface Fixture {
  id: string;
  title: string;
  site: string;
  steps: string[];
  updatedAt: number;
  publishedAt?: number;
  check?: Record<number, WebTourCheckResult> | 'pass';
  publicOn?: boolean;
  counts?: [number, number, number];
  misses?: Record<number, number>;
  runs?: number;
  author?: string;
  article?: 'draft' | 'published';
}

const FIXTURES: Fixture[] = [
  {
    id: 'yt',
    title: 'Embedded YouTube Video | Schoology',
    site: 'https://orono.schoology.com/course/*/materials',
    steps: [
      'Add Materials',
      'Add Page',
      'Page Title',
      'Insert Content',
      'YouTube',
      'Paste URL',
      'Video Settings',
      'Import as Embed',
      'Create',
      'Check the preview',
      'Save',
    ],
    updatedAt: 900,
    publishedAt: 900,
    check: 'pass',
    publicOn: true,
    counts: [0, 0, 3],
    runs: 2,
    author: 'Paul Ivers',
    article: 'draft',
  },
  {
    id: 'md',
    title: 'Enable Markdown in Google Docs',
    site: 'https://docs.google.com/document/d/*/edit?tab=*',
    steps: [
      'Click Tools',
      'Click Preferences',
      'Click Enable Markdown',
      'Click OK',
    ],
    updatedAt: 800,
    publishedAt: 800,
    check: 'pass',
    publicOn: true,
    runs: 1,
    author: 'Sean Beaverson',
    article: 'published',
  },
  {
    id: 'co',
    title: 'Add a co-teacher in Schoology',
    site: 'https://orono.schoology.com/course/*/members',
    steps: [
      'Open Members',
      'Add Members',
      'Search for the teacher',
      'Set as Admin',
      'Save',
    ],
    updatedAt: 760,
    publishedAt: 700,
    check: { 2: 'none', 3: 'weak' },
    counts: [14, 11, 0],
    runs: 6,
    author: 'Maria Fernanda Castellanos-Whitfield',
  },
  {
    id: 'sl',
    title: 'Share a Google Slides deck with a class',
    site: 'https://docs.google.com/presentation/d/*/edit',
    steps: [
      'Click Share',
      'Type the class group',
      'Set to Viewer',
      'Click Send',
    ],
    updatedAt: 600,
    publishedAt: 600,
    check: 'pass',
    counts: [31, 24, 0],
    runs: 9,
    misses: { 2: 4 },
  },
  {
    id: 'gm',
    title: 'Set up a Gmail filter for parent emails',
    site: 'https://orono.freshservice.com/a/solutions/*',
    author: 'Sean Beaverson',
    steps: [
      'Open search options',
      'Type the sender',
      'Create filter',
      'Pick a label',
      'Save',
    ],
    updatedAt: 500,
  },
  {
    id: 'gt',
    title: 'Share a board with a guest teacher',
    site: 'https://spartboard.web.app/*',
    steps: ['Open Share', 'Add the guest', 'Click Done'],
    updatedAt: 400,
    check: 'pass',
    author: 'Paul Ivers',
  },
];

const stepOf = (f: Fixture, label: string, i: number): GuidedLearningStep =>
  ({
    id: `${f.id}-${i + 1}`,
    label,
    text: '',
    web: {
      urlPattern: f.site,
      action: 'click',
      locator: { role: 'button', name: label },
    },
  }) as unknown as GuidedLearningStep;

const setOf = (f: Fixture): GuidedLearningSet => {
  const set: GuidedLearningSet = {
    id: f.id,
    title: f.title,
    imageUrls: [],
    mode: 'tour',
    surface: 'web',
    createdAt: 1,
    updatedAt: f.updatedAt,
    steps: f.steps.map((label, i) => stepOf(f, label, i)),
    ...(f.author ? { authorName: f.author } : {}),
  };
  if (!f.check) return set;
  const results: Record<string, WebTourCheckResult> = {};
  set.steps.forEach((s, i) => {
    results[s.id] = f.check === 'pass' ? 'found' : (f.check?.[i] ?? 'found');
  });
  return {
    ...set,
    webTourChecked: {
      by: 'mock-user-id',
      at: 1,
      sig: targetsSignature(set),
      results,
    },
  };
};

const runsOf = (f: Fixture): TourRun[] =>
  Array.from({ length: f.runs ?? 0 }, (_, r) => ({
    v: f.publishedAt ?? 0,
    startedAt: r,
    furthest: f.steps.length - 1,
    done: true,
    surface: 'web' as const,
    misses: Object.entries(f.misses ?? {})
      .filter(([, n]) => r < n)
      .map(([i]) => `${f.id}-${Number(i) + 1}`),
  }));

const seed = (): WebToursDevSeed => {
  const tours = FIXTURES.map(setOf);
  const published: WebToursDevSeed['published'] = {};
  const counts: WebToursDevSeed['counts'] = {};
  const runs: WebToursDevSeed['runs'] = {};
  const publicRecords: Record<string, unknown> = {};
  const publicPublished: Record<string, GuidedLearningSet | null> = {};
  FIXTURES.forEach((f, i) => {
    const set = tours[i];
    const pub = f.publishedAt
      ? {
          set: { ...set, updatedAt: f.publishedAt },
          publishedAt: f.publishedAt,
          publishedBy: 'x',
        }
      : null;
    published[f.id] = pub;
    publicPublished[f.id] = pub?.set ?? null;
    if (f.counts)
      counts[f.id] = {
        plays: f.counts[0],
        finished: f.counts[1],
        linkViews: f.counts[2],
      };
    runs[f.id] = runsOf(f);
    publicRecords[f.id] =
      f.publicOn && pub
        ? {
            token: '0123456789abcdef0123456789abcdef',
            fingerprint: pictureFingerprint(pub.set) ?? '',
            kind: 'web',
            confirmedBy: 'admin@example.com',
            confirmedAt: 1,
            pictures: {},
          }
        : null;
  });
  window.__publicLinkDevSeed = {
    records: publicRecords as never,
    published: publicPublished,
  };
  const articles: WebToursDevSeed['articles'] = {};
  FIXTURES.forEach((f) => {
    if (f.article)
      articles[f.id] = {
        published: f.article === 'published',
        url: null,
        sentAt: Number.MAX_SAFE_INTEGER,
      };
  });
  return { tours, published, counts, runs, articles };
};

const auth = {
  user: { uid: 'mock-user-id', email: 'admin@example.com' },
  isAdmin: true,
  canAccessFeature: () => true,
} as unknown as AuthContextType;

export const WebToursDevHarness: React.FC = () => {
  window.__webToursDevSeed ??= seed();
  return (
    <AuthContext.Provider value={auth}>
      <DialogProvider>
        <WebToursPage />
      </DialogProvider>
    </AuthContext.Provider>
  );
};
