// DEV-only: the Quiz-style Flashcards set editor, for /assign-stepper-dev?view=FlashcardSetEditor.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useContext } from 'react';
import type { FlashcardSet } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { FlashcardSetEditorModal } from '@/components/widgets/Flashcards/FlashcardSetEditorModal';

const CARDS: [string, string][] = [
  ['Mitochondria', 'Organelles that make energy for the cell.'],
  ['Nucleus', 'Holds the cell’s DNA and controls its activities.'],
  ['Ribosome', 'Builds proteins from amino acids.'],
  ['Golgi apparatus', 'Modifies, sorts and packages proteins for transport.'],
  [
    'Cell membrane',
    'Thin layer that controls what enters and leaves the cell.',
  ],
  ['Cytoplasm', 'Jelly-like fluid that fills the cell.'],
  ['Chloroplast', 'Captures sunlight to make food in plant cells.'],
  ['Vacuole', 'Stores water, food and waste.'],
  ['Lysosome', 'Breaks down waste and worn-out cell parts.'],
  ['Cell wall', 'Rigid outer layer that supports plant cells.'],
  ['Endoplasmic reticulum', 'Network of membranes that moves materials.'],
  ['Centriole', 'Helps the cell divide in animal cells.'],
];

export const DEV_FLASHCARD_SET: FlashcardSet = {
  id: 'dev-set-editor',
  title: 'Cell organelles',
  description: 'Unit 3 vocabulary',
  termLanguage: 'en-US',
  definitionLanguage: 'en-US',
  cards: CARDS.map(([term, definition], i) => ({
    id: `c${i + 1}`,
    term,
    definition,
  })),
  createdAt: 0,
  updatedAt: 1,
};

export const AllFeaturesOn: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const auth = useContext(AuthContext);
  const value = auth
    ? { ...auth, canAccessFeature: () => true }
    : ({ canAccessFeature: () => true } as unknown as typeof auth);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const Preview: React.FC = () => (
  <AllFeaturesOn>
    <FlashcardSetEditorModal
      set={DEV_FLASHCARD_SET}
      isNew={false}
      aiEnabled
      onPersist={() => new Promise((resolve) => setTimeout(resolve, 300))}
      onClose={() => undefined}
    />
  </AllFeaturesOn>
);

const preview = { title: 'Flashcards set editor', render: Preview };
export default preview;
