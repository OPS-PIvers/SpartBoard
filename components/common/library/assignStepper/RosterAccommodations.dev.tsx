// DEV-only: the class editor's Accommodations tab with saved groups, for /assign-stepper-dev.
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
  studentCount: 6,
  createdAt: 0,
  students: [
    person('a', 'Hamza', 'Abdi'),
    person('b', 'Margaret', 'Anderson-Whitfield'),
    person('c', 'Linh', 'Bui'),
    person('d', 'Owen', 'Carlson'),
    person('e', 'Sofia', 'Diaz'),
    person('f', 'J', 'Erickson'),
  ],
  groups: [
    { id: 'mods', name: 'Modified Assessments', studentIds: ['b', 'c', 'f'] },
  ],
  defaultOverridesByStudentId: { c: { timeMultiplier: 1.5 } },
};

const Preview: React.FC = () => (
  <RosterEditorModal
    isOpen
    roster={ROSTER}
    onClose={() => undefined}
    onSave={() => undefined}
    readAloudAvailable
    speechToTextAvailable
  />
);

const preview = { title: 'Class accommodations by group', render: Preview };
export default preview;
