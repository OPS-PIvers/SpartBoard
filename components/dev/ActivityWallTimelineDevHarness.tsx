/**
 * ActivityWallTimelineDevHarness — DEV-only fixtures for the Activity Wall timeline,
 * old list next to the dated axis at several sizes. Mounted at /activity-wall-timeline-dev.
 * `?view=editor` shows the time periods list; `?view=composer` shows the post composer with the date pickers; `?posts=60` pads the wall for load checks.
 */

import React from 'react';
import type { ActivityWallSubmission } from '@/types';
import { LayoutRouter } from '@/components/activityWall/render';
import {
  makeSession,
  makeSubmission,
} from '@/components/activityWall/render/fixtures';
import { ComposerSheet } from '@/components/activityWall/submission/ComposerSheet';
import { SectionsEditor } from '@/components/widgets/ActivityWall/editor/SectionsEditor';
import type { WallStructure } from '@/components/widgets/ActivityWall/editor/constants';

const photo = () => `${window.location.origin}/apple-touch-icon.png`;

const posts = (): ActivityWallSubmission[] => [
  makeSubmission({
    id: 'scope',
    title: 'Digital Microscope',
    type: 'photo',
    content: photo(),
    label: '1956',
    participantLabel: 'Student',
    submittedAt: 1,
  }),
  makeSubmission({
    id: 'sample',
    title: 'Sample text',
    content: 'Here is a sample',
    label: '1944',
    participantLabel: 'Paul Ivers',
    authorRole: 'teacher',
    submittedAt: 2,
  }),
  makeSubmission({
    id: 'press',
    title: 'Printing press',
    content: 'Gutenberg prints the first books with movable type in Mainz.',
    label: 'c. 1440',
    participantLabel: 'Maya R.',
    submittedAt: 3,
  }),
  makeSubmission({
    id: 'declaration',
    title: 'Declaration of Independence',
    content: 'The Continental Congress adopts the Declaration in Philadelphia.',
    label: 'July 4, 1776',
    participantLabel: 'Jonah P.',
    submittedAt: 4,
  }),
  makeSubmission({
    id: 'phone',
    title: 'Telephone patent',
    content: 'Alexander Graham Bell is granted a patent for the telephone.',
    label: 'March 7, 1876',
    participantLabel: 'Ava L.',
    submittedAt: 5,
  }),
  makeSubmission({
    id: 'flight',
    title: 'First powered flight',
    content: 'The Wright brothers fly for 12 seconds at Kitty Hawk.',
    label: 'December 17, 1903',
    participantLabel: 'Sam K.',
    submittedAt: 6,
  }),
  makeSubmission({
    id: 'dday',
    title: 'D-Day',
    content: 'Allied troops land on the beaches of Normandy.',
    label: 'June 6, 1944',
    participantLabel: 'Leo M.',
    submittedAt: 7,
  }),
  makeSubmission({
    id: 'moon',
    title: 'Moon landing',
    content: 'Apollo 11 lands; Neil Armstrong steps onto the Moon.',
    label: 'July 20, 1969',
    participantLabel: 'Priya S.',
    pinned: true,
    submittedAt: 8,
  }),
  makeSubmission({
    id: 'web',
    title: 'World Wide Web',
    content: 'Tim Berners-Lee publishes the first website.',
    label: 'August 1991',
    participantLabel: 'Eli W.',
    submittedAt: 9,
  }),
  makeSubmission({
    id: 'athens',
    title: 'Athenian democracy',
    content: 'Citizens of Athens vote directly on laws in the assembly.',
    label: '5th century BCE',
    participantLabel: 'Mia T.',
    submittedAt: 11,
  }),
  makeSubmission({
    id: 'civil-rights',
    title: 'Civil rights movement',
    content: 'Marches, sit-ins and new federal laws end legal segregation.',
    label: '1960s',
    participantLabel: 'Omar H.',
    submittedAt: 12,
  }),
  makeSubmission({
    id: 'ww2',
    title: 'World War II',
    content: 'War across Europe, Asia and the Pacific.',
    label: 'September 1, 1939 – September 2, 1945',
    participantLabel: 'Ruth K.',
    submittedAt: 13,
  }),
  makeSubmission({
    id: 'industrial',
    title: 'Factories spread',
    content: 'Steam-powered mills change how people work.',
    label: 'Early in the industrial era',
    participantLabel: 'Noah B.',
    submittedAt: 10,
  }),
];

const MONTHS = ['January', 'March', 'May', 'August', 'October', 'December'];

const padded = (count: number): ActivityWallSubmission[] => {
  const base = posts();
  const extra = Array.from(
    { length: Math.max(0, count - base.length) },
    (_, i) =>
      makeSubmission({
        id: `extra-${i}`,
        title: `Event ${i + 1}`,
        content:
          'A short note on why this event mattered to the people involved.',
        label: `${MONTHS[i % MONTHS.length]} ${1850 + ((i * 7) % 25)}`,
        participantLabel: `Student ${i + 1}`,
        submittedAt: 100 + i,
      })
  );
  return [...base, ...extra];
};

const legacySession = makeSession({
  title: 'Final product: multi-sided timeline',
  layout: 'timeline',
});
const TIME_PERIODS = [
  {
    id: 'industrial',
    label: 'Industrial Revolution',
    from: '1760',
    to: '1840',
  },
  { id: 'cold-war', label: 'Cold War', from: '1947', to: '1991' },
];

const datedSession = makeSession({
  title: 'Final product: multi-sided timeline',
  layout: 'timeline',
  timelineDates: true,
  timePeriods: TIME_PERIODS,
});

const PeriodsEditorPreview: React.FC = () => {
  const [value, setValue] = React.useState<WallStructure>({
    timePeriods: [
      ...TIME_PERIODS,
      { id: 'draft', label: 'Reconstruction', from: '1877', to: '1865' },
    ],
  });
  return (
    <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6">
      <SectionsEditor
        layout="timeline"
        timelineDates
        value={value}
        onChange={(patch) => setValue((prev) => ({ ...prev, ...patch }))}
      />
    </div>
  );
};
const WHITE_CARDS = { background: 'rgba(255,255,255,1)', color: '#0f172a' };

const Frame: React.FC<{
  label: string;
  width: number;
  height: number;
  children: React.ReactNode;
}> = ({ label, width, height, children }) => (
  <section className="space-y-2">
    <h2 className="text-sm font-bold text-slate-700">{label}</h2>
    <div
      className="overflow-hidden rounded-xl border border-slate-300 shadow"
      style={{ width, height, containerType: 'size' }}
    >
      {children}
    </div>
  </section>
);

export const ActivityWallTimelineDevHarness: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const submissions = padded(Number(params.get('posts')) || 0);

  if (view === 'editor') {
    return (
      <div className="h-screen bg-slate-100 p-6">
        <PeriodsEditorPreview />
      </div>
    );
  }

  if (view === 'composer') {
    return (
      <div className="h-screen bg-slate-100">
        <ComposerSheet
          session={datedSession}
          editing={undefined}
          onSubmit={() => undefined}
          onClose={() => undefined}
          busy={false}
          progress={null}
          error={null}
        />
      </div>
    );
  }

  const noop = () => undefined;
  const actions = { onAddAt: noop, onEdit: noop };

  if (view === 'present') {
    return (
      <div
        className="h-screen [height:100dvh]"
        style={{ containerType: 'size' }}
      >
        <LayoutRouter
          session={datedSession}
          submissions={submissions}
          mode="gallery"
          showNames
        />
      </div>
    );
  }

  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-100 p-6 pb-12">
      <div className="space-y-8">
        <Frame label="Before: list timeline" width={1100} height={420}>
          <LayoutRouter
            session={legacySession}
            submissions={submissions}
            mode="widget"
            showNames
            cardStyle={WHITE_CARDS}
            {...actions}
          />
        </Frame>
        <Frame
          label="After: large widget, white cards"
          width={1100}
          height={420}
        >
          <LayoutRouter
            session={datedSession}
            submissions={submissions}
            mode="widget"
            showNames
            cardStyle={WHITE_CARDS}
            {...actions}
          />
        </Frame>
        <Frame label="After: medium widget" width={720} height={380}>
          <LayoutRouter
            session={datedSession}
            submissions={submissions}
            mode="widget"
            showNames
            {...actions}
          />
        </Frame>
        <Frame label="After: small widget" width={420} height={260}>
          <LayoutRouter
            session={datedSession}
            submissions={submissions}
            mode="widget"
            showNames
            {...actions}
          />
        </Frame>
      </div>
    </div>
  );
};

export default ActivityWallTimelineDevHarness;
