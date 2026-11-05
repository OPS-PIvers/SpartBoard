// DEV-only: the real Flashcards assign stepper, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useContext, useMemo, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
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

const SPANISH = [
  ['la mesa', 'table'],
  ['el perro', 'dog'],
  ['la ventana', 'window'],
  ['el libro', 'book'],
  ['la cocina', 'kitchen'],
  ['el árbol', 'tree'],
  ['la playa', 'beach'],
  ['el cuaderno', 'notebook'],
  ['la guía', 'guide'],
  ['el reloj', 'clock'],
  ['la silla', 'chair'],
  ['el zapato', 'shoe'],
];

const SPANISH_SET: FlashcardSet = {
  id: 'dev-set-es',
  title: 'Unidad 2: La casa',
  termLanguage: 'es-US',
  definitionLanguage: 'en-US',
  cards: SPANISH.map(([term, definition], i) => ({
    id: `es${i}`,
    term,
    definition,
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

/** Every flag on, so the preview shows the flashcards-assign-v2 steps and Speak. */
const AllFlags: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useContext(AuthContext);
  const value = useMemo(
    () => (auth ? { ...auth, canAccessFeature: () => true } : auth),
    [auth]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const Preview: React.FC<{ set?: FlashcardSet }> = ({ set = SET }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-2 text-sm text-slate-600">
      <button // no-tour-anchor: dev-only mockup page, not on the teacher board
        type="button"
        onClick={() => setOpen(true)}
        className="font-bold text-brand-blue-primary"
      >
        Open
      </button>
      {open && (
        <FlashcardAssignStepper
          isOpen
          set={set}
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

const PreviewV2: React.FC = () => (
  <AllFlags>
    <Preview set={SPANISH_SET} />
  </AllFlags>
);

const preview = {
  title: 'Flashcards assign',
  render: () =>
    new URLSearchParams(window.location.search).get('v2') === '1' ? (
      <PreviewV2 />
    ) : (
      <Preview />
    ),
};
export default preview;
