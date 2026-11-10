import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { StepsView } from '@/components/tours/steps/StepsView';
import { StepsWalkthrough } from '@/components/tours/steps/StepsWalkthrough';
import { useStepsLabels } from '@/components/tours/steps/useStepsLabels';
import { parsePublicTourPath } from './publicLinkModel';
import {
  fetchPublicTour,
  publicPictures,
  type PublicTourView,
} from './publicTourApi';

type Load =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; tour: PublicTourView };

const NotFound: React.FC = () => {
  const { t } = useTranslation();
  return (
    <main
      data-testid="public-tour-missing"
      className="h-screen h-dvh overflow-y-auto bg-white px-4 py-16 pb-16"
    >
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('tourPublicLink.pageEyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {t('tourPublicLink.notFoundTitle')}
        </h1>
        <p className="mt-2 text-base text-slate-600">
          {t('tourPublicLink.notFoundBody')}
        </p>
      </div>
    </main>
  );
};

/** `/tour-steps/{token}`: a public tour's Steps view for anyone, signed out, with no app providers behind it. */
export const PublicTourPage: React.FC = () => {
  const { t } = useTranslation();
  const labels = useStepsLabels();
  const token = parsePublicTourPath(window.location.pathname);
  const [load, setLoad] = useState<Load>(
    token ? { kind: 'loading' } : { kind: 'missing' }
  );

  useEffect(() => {
    if (!token) return;
    const abort = new AbortController();
    fetchPublicTour(token, abort.signal)
      .then((tour) =>
        setLoad(tour ? { kind: 'ready', tour } : { kind: 'missing' })
      )
      .catch(() => {
        if (!abort.signal.aborted) setLoad({ kind: 'missing' });
      });
    return () => abort.abort();
  }, [token]);

  const tour = load.kind === 'ready' ? load.tour : null;
  const pictures = useMemo(
    () => (tour && token ? publicPictures(token, tour.steps) : {}),
    [tour, token]
  );

  if (load.kind === 'missing') return <NotFound />;
  if (!tour)
    return (
      <div className="flex h-screen h-dvh w-full items-center justify-center bg-white">
        <Loader2
          role="status"
          aria-label={labels.loading}
          className="h-8 w-8 animate-spin text-slate-400 motion-reduce:animate-none"
        />
      </div>
    );

  const title = tour.title.trim() || t('webTourHub.untitled');
  return (
    <main
      data-testid="public-tour"
      className="h-screen h-dvh overflow-y-auto bg-white px-4 py-10 pb-16"
    >
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('tourPublicLink.pageEyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 wrap-break-word">
          {title}
        </h1>
        <div className="mt-8">
          <StepsView
            steps={tour.steps}
            pictures={pictures}
            labels={labels}
            walkthrough={StepsWalkthrough}
            print={{ title }}
          />
        </div>
      </div>
    </main>
  );
};
