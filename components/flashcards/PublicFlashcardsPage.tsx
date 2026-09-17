import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Layers3, Loader2 } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '@/config/firebase';
import type { PublicFlashcardSet } from '@/types';
import { LocalFlashcardAdapter } from './adapters';
import { FlashcardPlayer } from './FlashcardPlayer';

type PublicSetState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; set: PublicFlashcardSet };

const getShareId = (): string | null => {
  const match = window.location.pathname.match(/^\/flashcards\/([^/?#]+)\/?$/u);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const isPublicSet = (value: unknown): value is PublicFlashcardSet => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PublicFlashcardSet>;
  return (
    typeof candidate.teacherUid === 'string' &&
    typeof candidate.setId === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.termLanguage === 'string' &&
    typeof candidate.definitionLanguage === 'string' &&
    typeof candidate.updatedAt === 'number' &&
    Array.isArray(candidate.cards) &&
    candidate.cards.length <= 500 &&
    candidate.cards.every(
      (card) =>
        typeof card === 'object' &&
        card !== null &&
        typeof card.id === 'string' &&
        typeof card.term === 'string' &&
        typeof card.definition === 'string'
    )
  );
};

const isFramed = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

const PublicFlashcardsReady: React.FC<{
  shareId: string;
  set: PublicFlashcardSet;
  embedded: boolean;
}> = ({ shareId, set, embedded }) => {
  const { t } = useTranslation();
  const adapter = useMemo(() => new LocalFlashcardAdapter(shareId), [shareId]);

  useEffect(() => {
    document.title = t('flashcards.public.pageTitle', { title: set.title });
  }, [set.title, t]);

  return (
    <div className="flex h-screen h-dvh flex-col overflow-hidden bg-slate-100">
      {!embedded && (
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <Layers3 aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black text-slate-900 sm:text-xl">
                {set.title}
              </h1>
              {set.description && (
                <p className="truncate text-sm text-slate-600">
                  {set.description}
                </p>
              )}
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {t('flashcards.public.cards', { count: set.cards.length })}
            </span>
          </div>
        </header>
      )}
      <main className="min-h-0 flex-1" role="main">
        <FlashcardPlayer
          cards={set.cards}
          termLanguage={set.termLanguage}
          definitionLanguage={set.definitionLanguage}
          adapter={adapter}
          seed={shareId}
        />
      </main>
    </div>
  );
};

export const PublicFlashcardsPage: React.FC = () => {
  const { t } = useTranslation();
  const [shareId] = useState(() => getShareId());
  const [embedded] = useState(() => isFramed());
  const [state, setState] = useState<PublicSetState>(
    shareId ? { kind: 'loading' } : { kind: 'unavailable' }
  );

  useEffect(() => {
    if (!shareId) return undefined;
    return onSnapshot(
      doc(db, 'public_flashcard_sets', shareId),
      (snapshot) => {
        const data = snapshot.data();
        if (!snapshot.exists() || !isPublicSet(data)) {
          setState({ kind: 'unavailable' });
          return;
        }
        setState({ kind: 'ready', set: data });
      },
      (error) => {
        console.error('[PublicFlashcardsPage] Public set read failed:', error);
        setState({ kind: 'unavailable' });
      }
    );
  }, [shareId]);

  useEffect(() => {
    if (!embedded) return undefined;
    document.body.dataset.chromeFree = 'true';
    return () => {
      delete document.body.dataset.chromeFree;
    };
  }, [embedded]);

  if (state.kind === 'loading') {
    return (
      <div className="flex h-screen h-dvh items-center justify-center bg-slate-100 text-slate-700">
        <Loader2
          aria-hidden="true"
          className="mr-2 h-5 w-5 animate-spin text-rose-600"
        />
        <span className="font-bold">{t('flashcards.public.loading')}</span>
      </div>
    );
  }

  if (state.kind === 'unavailable' || state.set.cards.length === 0) {
    return (
      <div className="flex h-screen h-dvh items-center justify-center bg-slate-100 p-6 text-center">
        <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <AlertTriangle
            aria-hidden="true"
            className="mx-auto h-10 w-10 text-rose-600"
          />
          <h1 className="mt-4 text-xl font-black text-slate-900">
            {t('flashcards.public.unavailableTitle')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t('flashcards.public.unavailableBody')}
          </p>
        </section>
      </div>
    );
  }

  return (
    <PublicFlashcardsReady
      key={state.set.setId}
      shareId={shareId ?? ''}
      set={state.set}
      embedded={embedded}
    />
  );
};
