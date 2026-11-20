// DEV-only: the class editor's Groups tab without group reminders, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React from 'react';
import type { ClassRoster } from '@/types';
import { RosterEditorModal } from '@/components/classes/RosterEditorModal';

const NAMES: [string, string][] = [
  ['Hamza', 'Abdi'],
  ['Margaret', 'Anderson-Whitfield'],
  ['Linh', 'Bui'],
  ['Owen', 'Carlson'],
  ['Sofia', 'Diaz'],
  ['J', 'Erickson'],
  ['Ava', 'Fischer'],
  ['Mateo', 'Garcia'],
  ['Noah', 'Halvorson'],
  ['Isabella', 'Johnson'],
  ['Liam', 'Kowalczyk'],
  ['Emma', 'Larson'],
  ['Ethan', 'Mohamud'],
  ['Olivia', 'Nguyen'],
  ['Lucas', 'Olson'],
  ['Mia', 'Peterson'],
  ['Henry', 'Quist'],
  ['Harper', 'Rasmussen'],
  ['Elijah', 'Schmidt'],
  ['Amelia', 'Thao'],
  ['James', 'Vang'],
  ['Evelyn', 'Warsame'],
  ['Benjamin', 'Xiong'],
  ['Charlotte', 'Yang'],
];

const ROSTER: ClassRoster = {
  id: 'r1',
  name: 'Sample - Mock Period 1 (TEST)',
  driveFileId: null,
  studentCount: NAMES.length,
  createdAt: 0,
  students: NAMES.map(([f, l], i) => ({
    id: `s${i}`,
    firstName: f,
    lastName: l,
    pin: `${100 + i}`,
  })),
  groups: [
    { id: 'g1', name: 'Modified Assessments', studentIds: ['s1', 's2', 's5'] },
    { id: 'g2', name: 'Group A', studentIds: ['s9'] },
    {
      id: 'g3',
      name: 'Reading intervention with Ms. Halvorson-Kowalczyk',
      studentIds: ['s0', 's3', 's7', 's12', 's13', 's16', 's19', 's21', 's22'],
    },
  ],
  defaultOverridesByStudentId: {
    s1: { readAloud: true, speechToText: true, language: 'es' },
    s2: {
      readAloud: true,
      speechToText: true,
      language: 'es',
      timeMultiplier: 1.5,
    },
    s5: { readAloud: true, speechToText: true, language: 'es' },
    s3: { answerChoices: 2, modifiedQuestions: true },
  },
};

const Preview: React.FC = () => (
  <RosterEditorModal
    isOpen
    roster={ROSTER}
    onClose={() => undefined}
    onSave={() => undefined}
    groupsRedesign={!window.location.search.includes('old')}
    readAloudAvailable
    speechToTextAvailable
  />
);

const preview = { title: 'Class groups and accommodations', render: Preview };
export default preview;
