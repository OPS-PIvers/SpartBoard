// DEV-only: the real Flashcards assign stepper, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { ClassRoster, FlashcardSet } from '@/types';
import { FlashcardAssignStepper } from '@/components/widgets/Flashcards/FlashcardAssignStepper';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';

const SET: FlashcardSet = {
  id: 'dev-set',
  title: 'Unit 3 Vocabulary',
  termLanguage: 'en-US',
  definitionLanguage: 'en-US',
  cards: Array.from({ length: 24 }, (_, i) => ({
    id: `c${i}`,
    term: `term ${i}`,
    definition: `definition ${i}`,
  })),
  createdAt: 0,
  updatedAt: 0,
};

const NAMES = ['Avery', 'Jordan', 'Priya', 'Mateo', 'Sofia', 'Elijah'];

const roster = (n: number): ClassRoster => ({
  id: `p${n}`,
  name: `Sample ${n}`,
  driveFileId: null,
  studentCount: NAMES.length,
  createdAt: 0,
  classlinkClassId: `CL-${n}`,
  bellPeriod: { buildingId: 'b', periodId: String(n) },
  students: NAMES.map((name, i) => ({
    id: `p${n}-${i}`,
    firstName: name,
    lastName: 'S',
    pin: String(i),
    classLinkSourcedId: `SID-${n}-${i}`,
  })),
});

const ROSTERS = [roster(1), roster(2), roster(3)];

const PERIOD_CTX: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: () => null,
  onTagRoster: () => undefined,
};

const Preview: React.FC = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-2 text-sm text-slate-600">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-bold text-brand-blue-primary"
      >
        Open
      </button>
      {open && (
        <FlashcardAssignStepper
          isOpen
          set={SET}
          rosters={ROSTERS}
          initialRosterIds={ROSTERS.map((r) => r.id)}
          onClose={() => setOpen(false)}
          onAssign={() => {
            setOpen(false);
            return Promise.resolve(true);
          }}
          periodAccess={PERIOD_CTX}
        />
      )}
    </div>
  );
};

const preview = { title: 'Flashcards assign', render: Preview };
export default preview;
