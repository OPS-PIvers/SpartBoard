// DEV-only: the real Flashcards editor with typed IPA on a card, for /assign-stepper-dev?view=FlashcardEditorIpa.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useContext } from 'react';
import type { FlashcardCard, FlashcardSet } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { FlashcardEditor } from '@/components/widgets/Flashcards/FlashcardEditor';

const speak = (
  term: string,
  tokens: string[],
  ipaOverride?: Record<string, string>
): FlashcardCard['speak'] => ({
  term,
  refs: [{ dialect: 'en-US', tokens, stress: [] }],
  g2pVersion: 'dev',
  status: 'ready',
  dialects: ['en-US'],
  ...(ipaOverride ? { ipaOverride } : {}),
});

const SET: FlashcardSet = {
  id: 'dev-ipa-set',
  title: 'Cell organelles',
  termLanguage: 'en-US',
  definitionLanguage: 'en-US',
  cards: [
    {
      id: 'c1',
      term: 'Mitochondria',
      definition: 'Organelles that make energy for the cell.',
      speak: speak('Mitochondria', ['m', 'a', 'ɪ']),
    },
    {
      id: 'c2',
      term: 'Golgi apparatus',
      definition:
        'Stacked membranes that modify, sort and package proteins for transport.',
      speak: speak('Golgi apparatus', ['ɡ', 'ɔ', 'l'], {
        'en-US': '/ˈɡɔldʒi ˌæpəˈreɪtəs/|/ˈɡoʊldʒi ˌæpəˈrætəs/',
      }),
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const SpeakOn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useContext(AuthContext);
  const value = auth
    ? { ...auth, canAccessFeature: () => true }
    : ({ canAccessFeature: () => true } as unknown as typeof auth);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const Preview: React.FC = () => (
  <SpeakOn>
    <div
      className="mx-auto bg-white"
      style={{ width: 900, height: 640, containerType: 'size' }}
    >
      <FlashcardEditor
        initialSet={SET}
        saving={false}
        onCancel={() => undefined}
        onSave={() => Promise.resolve()}
      />
    </div>
  </SpeakOn>
);

const preview = { title: 'Flashcards editor IPA', render: Preview };
export default preview;
