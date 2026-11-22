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
  ],
};

// ?hide=symbol,schedule mimics a building with those steps switched off.
const hidden = new URLSearchParams(window.location.search).get('hide') ?? '';
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
    groupRemindersEnabled
    groupReminderEmailsEnabled
  />
);

const preview = { title: 'Class group editor', render: Preview };
export default preview;
