import React, { useState } from 'react';
import type { ClassRoster } from '@/types';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import { ModificationsLink, ModificationsView } from './ModificationsView';

const student = (
  id: string,
  firstName: string,
  lastName: string,
  signIn = true
) => ({
  id,
  firstName,
  lastName,
  pin: id,
  ...(signIn ? { classLinkSourcedId: `SID-${id}` } : {}),
});

const ROSTERS: ClassRoster[] = [
  {
    id: 'p2',
    name: 'Sample 2',
    driveFileId: 'f2',
    studentCount: 5,
    createdAt: 0,
    defaultOverridesByStudentId: {
      a1: { readAloud: true },
      a2: { language: 'ru' },
    },
    students: [
      student('a1', 'Maya', 'Alvarez'),
      student('a2', 'Ivan', 'Petrov'),
      student('a3', 'Owen', 'Brooks'),
      student('a4', 'Lena', 'Kim'),
      student('a5', 'Sam', 'Ortiz', false),
    ],
  },
  {
    id: 'p3',
    name: 'Sample 3',
    driveFileId: 'f3',
    studentCount: 3,
    createdAt: 0,
    defaultOverridesByStudentId: { b1: { timeMultiplier: 1.5 } },
    students: [
      student('b1', 'Noah', 'Fischer'),
      student('b2', 'Ava', 'Nguyen'),
      student('b3', 'Eli', 'Ward', false),
    ],
  },
];

// eslint-disable-next-line react-refresh/only-export-components -- the harness default export is a preview object, not a component
const Preview: React.FC = () => {
  const [value, setValue] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <ModificationsLink
          rosters={ROSTERS}
          value={value}
          onOpen={() => setOpen(true)}
        />
      </div>
      {open && (
        <div className="h-[640px] w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <ModificationsView
            activityTitle="Fractions check"
            rosters={ROSTERS}
            value={value}
            onChange={setValue}
            onBack={() => setOpen(false)}
            quizMode
            readAloudAvailable
            quizContext={{
              questions: [],
              rubrics: [],
              translation: { index: {}, onGenerate: () => undefined },
            }}
          />
        </div>
      )}
    </div>
  );
};

const preview = {
  title: 'Modifications view',
  render: () => <Preview />,
};

export default preview;
