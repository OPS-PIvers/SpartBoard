import React, { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Link2,
  Loader2,
  OctagonAlert,
} from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { GuidedLearningSet } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { logError } from '@/utils/logError';
import { loadPublishedTour } from '@/components/tours/publishedTours';
import { loadTourRuns } from '@/components/tours/tourRuns';
import { listWebTourDrafts } from '@/components/tours/webTours';
import { useCopyWebTourLink } from '@/components/tours/web/useCopyWebTourLink';
import { hubStepsOf, type HubStep } from '@/components/tours/web/webTourHub';
import {
  webFieldStatsOf,
  webStepState,
  worstWebState,
  type WebStepState,
  type WebTourFieldStats,
} from '@/components/tours/web/webTourHealth';

interface LoadedWebTour {
  id: string;
  title: string;
  published: boolean;
  steps: HubStep[];
  field: WebTourFieldStats | null;
}

async function loadWebTour(draft: GuidedLearningSet): Promise<LoadedWebTour> {
  const [published, runs] = await Promise.all([
    loadPublishedTour(draft.id).catch(() => null),
    loadTourRuns(draft.id).catch(() => null),
  ]);
  const set = published?.set ?? draft;
  return {
    id: draft.id,
    title: set.title || draft.title,
    published: !!published,
    steps: hubStepsOf(set.steps),
    field:
      runs && published ? webFieldStatsOf(runs, published.publishedAt) : null,
  };
}

const STATE_KEY: Record<WebStepState, string> = {
  ok: 'tourHealth.web.state.ok',
  weak: 'tourHealth.web.state.weak',
  missed: 'tourHealth.web.state.missed',
};

const StateIcon: React.FC<{ state: WebStepState }> = ({ state }) =>
  state === 'ok' ? (
    <CheckCircle2
      className="w-3.5 h-3.5 shrink-0 text-emerald-600"
      aria-hidden="true"
    />
  ) : state === 'weak' ? (
    <AlertTriangle
      className="w-3.5 h-3.5 shrink-0 text-amber-600"
      aria-hidden="true"
    />
  ) : (
    <OctagonAlert
      className="w-3.5 h-3.5 shrink-0 text-red-600"
      aria-hidden="true"
    />
  );

const CopyTourLink: React.FC<{ setId: string; title: string }> = ({
  setId,
  title,
}) => {
  const { t } = useTranslation();
  const copyLink = useCopyWebTourLink();
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const copy = async () => {
    if (state === 'working') return;
    setState('working');
    if (!(await copyLink(setId, title))) {
      setState('idle');
      return;
    }
    setState('done');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1500);
  };

  return (
    <button
      type="button"
      {...tourFieldAttr('admin.help-center.web-tour-copy-link', 'help', setId)}
      onClick={() => void copy()}
      aria-label={t('tourHealth.web.copyLinkFor', { title })}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-blue-primary hover:bg-slate-100"
    >
      {state === 'working' ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : state === 'done' ? (
        <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {state === 'done'
        ? t('tourHealth.web.linkCopied')
        : t('tourHealth.web.copyLink')}
    </button>
  );
};

/** Live tour health for web tours: real runs that fell back to the picture or matched weakly (T10). */
export const WebTourHealthSection: React.FC<{
  listDrafts?: () => Promise<GuidedLearningSet[]>;
}> = ({ listDrafts = listWebTourDrafts }) => {
  const { t } = useTranslation();
  // Read softly so the panel still renders where no auth provider is mounted.
  const enabled =
    useContext(AuthContext)?.canAccessFeature('web-tours') ?? false;
  const [tours, setTours] = useState<LoadedWebTour[] | 'failed' | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void listDrafts()
      .then((drafts) => Promise.all(drafts.map(loadWebTour)))
      .then((loaded) => {
        if (!cancelled) setTours(loaded);
      })
      .catch((err: unknown) => {
        logError('WebTourHealthSection.load', err);
        if (!cancelled) setTours('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, listDrafts]);

  if (!enabled) return null;

  return (
    <section
      aria-labelledby="web-tour-health-title"
      className="space-y-3 border-t border-slate-200 pt-3"
    >
      <div>
        <h3
          id="web-tour-health-title"
          className="text-sm font-semibold text-slate-900"
        >
          {t('tourHealth.web.title')}
        </h3>
        <p className="text-xs text-slate-500">{t('tourHealth.web.intro')}</p>
      </div>
      {tours === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {t('tourHealth.loading')}
        </p>
      ) : tours === 'failed' ? (
        <p className="text-sm text-slate-500">
          {t('tourHealth.web.loadFailed')}
        </p>
      ) : tours.length === 0 ? (
        <p className="text-sm text-slate-500">{t('tourHealth.web.empty')}</p>
      ) : (
        tours.map((tour) => {
          const title = tour.title || t('tourHealth.untitledSet');
          const states = tour.steps.map((step) =>
            webStepState(step.id, tour.field)
          );
          const state = worstWebState(states);
          return (
            <section
              key={tour.id}
              aria-label={title}
              className="border border-slate-200 rounded-lg bg-white"
            >
              <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 border-b border-slate-100">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {title}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {tour.published
                      ? t('tourHealth.published')
                      : t('tourHealth.web.notPublished')}
                    {tour.published && (
                      <>
                        {' · '}
                        {tour.field
                          ? t('tourHealth.runSummary', {
                              runs: tour.field.runs,
                              done: tour.field.done,
                            })
                          : t('tourHealth.runsUnavailable')}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {tour.field && (
                    <span
                      data-testid="web-tour-state"
                      className="flex items-center gap-1 text-xs font-semibold text-slate-700"
                    >
                      <StateIcon state={state} />
                      {t(STATE_KEY[state])}
                    </span>
                  )}
                  {tour.published && (
                    <CopyTourLink setId={tour.id} title={title} />
                  )}
                </div>
              </header>
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5 font-semibold">
                      {t('tourHealth.colStep')}
                    </th>
                    <th className="px-3 py-1.5 font-semibold">
                      {t('tourHealth.web.colPage')}
                    </th>
                    <th className="px-3 py-1.5 font-semibold">
                      {t('tourHealth.colStatus')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tour.steps.map((step, i) => {
                    const stepState = states[i];
                    const weak = tour.field?.weak.get(step.id);
                    return (
                      <tr key={step.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">
                          {i + 1}.{' '}
                          {step.label?.trim()
                            ? step.label
                            : t('tourHealth.untitledStep')}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-slate-600 break-all">
                          {step.web.urlPattern}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700">
                          {tour.field ? (
                            <span className="flex items-center gap-1 font-semibold">
                              <StateIcon state={stepState} />
                              {t(STATE_KEY[stepState])}
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              {t('tourHealth.notChecked')}
                            </span>
                          )}
                          {stepState === 'missed' && (
                            <span className="block text-slate-500">
                              {t('tourHealth.web.reason.missed', {
                                misses: tour.field?.misses.get(step.id) ?? 0,
                                runs: tour.field?.runs ?? 0,
                              })}
                            </span>
                          )}
                          {stepState === 'weak' && weak && (
                            <span className="block text-slate-500">
                              {t('tourHealth.web.reason.weak', {
                                weak: weak.text + weak.css,
                                runs: tour.field?.runs ?? 0,
                              })}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </section>
  );
};
