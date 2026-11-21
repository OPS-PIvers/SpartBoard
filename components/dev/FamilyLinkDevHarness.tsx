// The family link switch and the public family page on fixtures at /family-link-dev (dev and auth-bypass builds only).
import React, { useState } from 'react';
import type { Course, FamilyPage } from '@/utils/course/contract';
import type { DeckSharingDrive } from '@/utils/course/deckSharing';
import { FamilyLinkControl } from '@/components/classes/course/FamilyLinkSetup';
import {
  FamilyPageUnavailable,
  FamilyPageView,
} from '@/components/family/FamilyPage';
import type { UseCoursesResult } from '@/hooks/useCourses';

const course: Course = {
  id: 'c1',
  name: 'English 9',
  teacherName: 'Jordan Rivera-Castellanos',
  rosterIds: ['p2', 'p5'],
  agenda: { fileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', title: 'Agenda' },
  pinnedLinks: [],
  familyLink: null,
  linkId: 'l1',
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 0,
};

const page: FamilyPage = {
  courseName: 'English 9',
  teacherName: 'Jordan Rivera-Castellanos',
  agenda: course.agenda,
  pinnedLinks: [
    { title: 'Reading schedule', url: 'https://example.com/schedule' },
    { title: 'Class supply list', url: 'https://example.com/supplies' },
    {
      title:
        'Semester project rubric and checklist for the persuasive essay unit',
      url: 'https://example.com/rubric',
    },
  ],
  updatedAt: 0,
};

const fakeDrive: DeckSharingDrive = {
  listFilePermissions: () => Promise.resolve([]),
  addLinkReaderPermission: () => Promise.resolve(),
  deletePermission: () => Promise.resolve(),
  getFileModifiedTime: () => Promise.resolve(null),
};

export const FamilyLinkDevHarness: React.FC = () => {
  const [view, setView] = useState<'setup' | 'page' | 'off'>('setup');
  const [state, setState] = useState(course);
  const saveCourse: UseCoursesResult['saveCourse'] = (req) => {
    const on = req.action === 'save' && req.course.familyLinkOn === true;
    setState((c) => ({
      ...c,
      familyLink: { shareId: 'share-abc123', on },
      updatedAt: c.updatedAt + 1,
    }));
    return Promise.resolve({
      courseId: 'c1',
      rostersWithoutClassPage: [],
      classLinkUnavailable: false,
    });
  };
  return (
    <div className="h-screen h-dvh overflow-y-auto bg-slate-100 pb-16">
      <div className="flex gap-2 p-2 text-sm">
        {(['setup', 'page', 'off'] as const).map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`harness-${v}`}
            onClick={() => setView(v)}
            className={`rounded px-2 py-1 ${view === v ? 'bg-slate-800 text-white' : 'bg-white'}`}
          >
            {v}
          </button>
        ))}
      </div>
      {view === 'setup' && (
        <div className="mx-4 w-80 bg-white">
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            <li>
              <div className="px-3 py-2 text-sm font-bold text-slate-800">
                English 9
                <span className="block text-xxs font-semibold uppercase tracking-widest text-slate-400">
                  2 sections
                </span>
              </div>
              <FamilyLinkControl
                course={state}
                saveCourse={saveCourse}
                drive={fakeDrive}
                domain="orono.k12.mn.us"
                origin="https://spartboard.web.app"
              />
            </li>
          </ul>
        </div>
      )}
      {view === 'page' && <FamilyPageView page={page} />}
      {view === 'off' && <FamilyPageUnavailable />}
    </div>
  );
};
