// `/writing-peer-dev`: Writing peer review on fixtures. `?view=` setup | partner | writer, `&access=` view | comment | edit.
import React, { useState } from 'react';
import type { WritingPeerAccess, WritingPeerMark } from '@/types';
import {
  WritingStudentShell,
  type WritingPeerTab,
  type WritingShellSession,
} from '@/components/student/writing/WritingStudentShell';
import {
  PartnerFeedbackPanel,
  PartnerReviewPanel,
} from '@/components/student/writing/peerReview/PeerReviewPanels';
import { PeerPairingModal } from '@/components/widgets/Writing/components/peerReview/PeerPairingModal';
import type { NewPeerMark } from '@/hooks/useWritingPeerReview';
import { pairAtRandom, peerStudentList } from '@/utils/writingPeerReview';
import { WritingMonitorDev } from './WritingMonitorDev';

const params = new URLSearchParams(window.location.search);
const VIEW = params.get('view') ?? 'setup';
const ACCESS = (params.get('access') ?? 'edit') as WritingPeerAccess;

const NAMES: [string, string][] = [
  ['Maya', 'Okonkwo-Lindqvist'],
  ['Bo', 'Lee'],
  ['Ana', 'García'],
  ['J', 'Nguyen'],
  ['Christopher-Alexander', 'Van der Westhuizen'],
  ['Aiden', 'Brooks'],
  ['Sofía', 'Hernández'],
  ['Liam', 'Olsen'],
  ['Priya', 'Raman'],
  ['Noah', 'Schmidt'],
  ['Zoë', 'Adebayo'],
  ['Ethan', 'Kowalski'],
  ['Hana', 'Sato'],
  ['Mason', 'Peterson'],
  ['Isabella', 'Rossi'],
  ['Owen', 'Miller'],
  ['Lucía', 'Torres'],
  ['Elijah', 'Johnson'],
  ['Amara', 'Diallo'],
  ['Henry', 'Larsen'],
  ['Mei', 'Chen'],
  ['Jack', 'Anderson'],
  ['Fatima', 'Al-Sayed'],
  ['Leo', 'Fischer'],
  ['Grace', 'Kim'],
  ['Ezra', 'Novak'],
  ['Ava', 'Lindgren'],
  ['Kai', 'Nakamura'],
  ['Ruby', 'Haugen'],
];

const STUDENTS = peerStudentList(
  NAMES.map((_, i) => `s${i + 1}`),
  new Map(
    NAMES.map(([givenName, familyName], i) => [
      `s${i + 1}`,
      { givenName, familyName },
    ])
  )
);

// A fixed shuffle so screenshots stay the same between runs.
let seed = 7;
const seeded = () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const SOME_GROUPS = pairAtRandom(
  STUDENTS.slice(0, 21).map((s) => s.uid),
  [],
  seeded
);

const SESSION: WritingShellSession = {
  title: 'Personal narrative: a moment that changed you',
  prompt: 'Write about a time something **changed how you see the world**.',
  minWords: 40,
  maxWords: 600,
  dueAt: Date.UTC(2026, 10, 24, 15, 0),
};

const HTML =
  '<p>The morning of the science fair, I dropped my volcano in the parking lot. Baking soda went everywhere, and the cardboard cone folded in half.</p><p>My little brother picked up the pieces without a word and handed me the tape. We rebuilt it on the hood of the car in twenty minutes.</p><p>That was the day I learned that being calm is something you do, not something you feel.</p>';
const TEXT = HTML.replace(/<\/p><p>/g, '\n').replace(/<\/?p>/g, '');

const mark = (
  id: string,
  kind: WritingPeerMark['kind'],
  quote: string,
  extra: Partial<WritingPeerMark>
): WritingPeerMark => ({
  id,
  by: 's2',
  kind,
  start: TEXT.indexOf(quote),
  end: TEXT.indexOf(quote) + quote.length,
  quote,
  status: 'open',
  createdAt: 1,
  ...extra,
});

const MARKS: WritingPeerMark[] = [
  mark('m1', 'comment', 'Baking soda went everywhere', {
    body: 'I can picture this. What did it smell like?',
  }),
  mark('m2', 'edit', 'without a word', { insert: 'without saying a word' }),
  mark('m3', 'edit', 'in twenty minutes', { insert: 'in just twenty minutes' }),
  mark('m4', 'comment', 'being calm is something you do', {
    body: 'Great ending. Maybe say what you did to stay calm.',
  }),
];

const nameOf = (uid: string) =>
  STUDENTS.find((s) => s.uid === uid)?.name ?? 'Your partner';

const StudentView: React.FC<{ start: WritingPeerTab }> = ({ start }) => {
  const [tab, setTab] = useState<WritingPeerTab>(start);
  const [notes, setNotes] = useState(MARKS);
  const [mine, setMine] = useState<WritingPeerMark[]>(
    ACCESS === 'view' ? [] : MARKS.slice(0, 2).map((m) => ({ ...m, by: 'me' }))
  );
  const add = (m: NewPeerMark) => {
    setMine((x) => [
      ...x,
      { ...m, id: `n${x.length}`, by: 'me', status: 'open', createdAt: 2 },
    ]);
    return Promise.resolve(true);
  };
  const close = (id: string, status: WritingPeerMark['status']) => {
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, status } : n)));
    return Promise.resolve(true);
  };
  return (
    <WritingStudentShell
      session={SESSION}
      onDone={() => undefined}
      peer={{
        tab,
        onTab: setTab,
        feedbackCount: notes.filter((n) => n.status === 'open').length,
        showFeedback: true,
        partnerName: 'Lee, Bo',
        panel:
          tab === 'partner' ? (
            <PartnerReviewPanel
              partner={{ html: HTML, started: true, marks: mine }}
              failed={false}
              access={ACCESS}
              onAdd={add}
              onDelete={(id) => {
                setMine((x) => x.filter((m) => m.id !== id));
                return Promise.resolve(true);
              }}
            />
          ) : tab === 'feedback' ? (
            <PartnerFeedbackPanel
              html={HTML}
              notes={notes}
              nameOf={nameOf}
              canAccept
              onAccept={() => true}
              onClose={close}
            />
          ) : null,
      }}
    />
  );
};

export const WritingPeerDevHarness: React.FC = () => {
  if (VIEW === 'partner') return <StudentView start="partner" />;
  if (VIEW === 'writer') return <StudentView start="feedback" />;
  return (
    <>
      <WritingMonitorDev />
      <PeerPairingModal
        isOpen
        onClose={() => undefined}
        students={STUDENTS}
        initialGroups={SOME_GROUPS}
        initialAccess="comment"
        onSave={() => Promise.resolve(true)}
        onEnd={() => Promise.resolve(true)}
        running={params.has('running')}
      />
    </>
  );
};
