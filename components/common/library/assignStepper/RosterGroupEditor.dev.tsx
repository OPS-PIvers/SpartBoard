// DEV-only: the class editor's Groups tab with the group editor stepper, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React from 'react';
import type { ClassRoster } from '@/types';
import { RosterEditorModal } from '@/components/classes/RosterEditorModal';

const person = (id: string, first: string, last: string) => ({
  id,
  firstName: first,
  lastName: last,
  pin: id,
});

const ROSTER: ClassRoster = {
  id: 'r1',
  name: 'Sample - Mock Period 1 (TEST)',
  driveFileId: null,
  studentCount: 8,
  createdAt: 0,
  students: [
    person('a', 'Hamza', 'Abdi'),
    person('b', 'Margaret', 'Anderson-Whitfield'),
    person('c', 'Linh', 'Bui'),
    person('d', 'Owen', 'Carlson'),
    person('e', 'Sofia', 'Diaz'),
    person('f', 'J', 'Erickson'),
    person('g', 'Ava', 'Fischer'),
    person('h', 'Mateo', 'Garcia'),
  ],
  groups: [
    {
      id: 'mods',
      name: 'Modified Assessments',
      studentIds: ['b', 'c', 'f'],
      inGroupMaker: false,
      symbol: { icon: 'squirrel', color: '#f59e0b' },
    },
    {
      id: 'speech',
      name: 'Speech pull-out',
      studentIds: ['a', 'd'],
      symbol: { icon: 'turtle', color: '#16a34a' },
      reminder: {
        enabled: true,
        days: [1, 3],
        alerts: [{ time: '10:15', leadMinutes: 5 }],
        repeat: 'weekly',
        startDate: '2026-11-23',
        sound: 'chime',
        snoozeMinutes: 3,
        showName: true,
        showTime: true,
        showMessage: false,
        message: '',
        emailAlert: false,
        emailMessage: '',
      },
    },
    { id: 'reading', name: 'Reading table', studentIds: ['e', 'g', 'h'] },
  ],
  defaultOverridesByStudentId: {
    b: { timeMultiplier: 2, readAloud: true, answerChoices: 3 },
    c: { timeMultiplier: 2, readAloud: true, answerChoices: 3 },
    f: { timeMultiplier: 2, readAloud: true, answerChoices: 3 },
  },
};

// ?hide=symbol,schedule mimics a building with those steps switched off.
const params = new URLSearchParams(window.location.search);
const hidden = params.get('hide') ?? '';
// ?teacher=1 shows the Groups tab a teacher without Group reminders sees.
const reminders = params.get('teacher') !== '1';
const groupSteps = {
  symbol: !hidden.includes('symbol'),
  schedule: !hidden.includes('schedule'),
  settings: !hidden.includes('settings'),
};

const Preview: React.FC = () => (
  <RosterEditorModal
    groupSteps={groupSteps}
    isOpen
    roster={ROSTER}
    onClose={() => undefined}
    onSave={() => undefined}
    groupRemindersEnabled={reminders}
    groupReminderEmailsEnabled={reminders}
  />
);

const preview = { title: 'Class group editor', render: Preview };
export default preview;
