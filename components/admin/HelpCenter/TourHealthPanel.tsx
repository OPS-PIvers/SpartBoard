import React, { lazy, Suspense, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Circle,
  Loader2,
  OctagonAlert,
  PanelTopOpen,
  Radar,
} from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { loadBuildingSet, useGuidedLearning } from '@/hooks/useGuidedLearning';
import { AuthContext } from '@/context/AuthContextValue';
import { TOOLS } from '@/config/tools';
import { requestRecordTour } from '@/components/tours/tourState';
import { loadPublishedTour } from '@/components/tours/publishedTours';
import { loadTourRuns } from '@/components/tours/tourRuns';
import {
  checkAnchorsLive,
  fieldStatsOf,
  stepVerdict,
  tourHealthOf,
  worstState,
  type StepHealthReason,
  type TourFieldStats,
  type TourHealthState,
} from '@/components/tours/tourHealth';
import { UnmappedAnchorsSection } from './UnmappedAnchorsSection';

const GuidedLearningStudio = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio').then(
    (m) => ({ default: m.GuidedLearningStudio })
  )
);

interface LoadedTour {
  /** The saved set, which the Studio edits. */
  draft: GuidedLearningSet;
  /** What teachers run: the published snapshot, or the saved set before its first publish. */
  runs: GuidedLearningSet;
  published: boolean;
  field: TourFieldStats | null;
}

const STATE_KEY: Record<TourHealthState, string> = {
  ok: 'tourHealth.state.ok',
  'needs-open': 'tourHealth.state.needsOpen',
  broken: 'tourHealth.state.broken',
};

const REASON_KEY: Record<StepHealthReason, string> = {
  'unknown-anchor': 'tourHealth.reason.unknownAnchor',
  'needs-widget-type': 'tourHealth.reason.needsWidgetType',
  'unexpected-widget-type': 'tourHealth.reason.unexpectedWidgetType',
  'unknown-widget-type': 'tourHealth.reason.unknownWidgetType',
  'field-misses': 'tourHealth.reason.fieldMisses',
  'not-on-screen': 'tourHealth.reason.notOnScreen',
  'needs-widget': 'tourHealth.reason.needsWidget',
  'widget-not-added': 'tourHealth.reason.widgetNotAdded',
  'needs-panel': 'tourHealth.reason.needsPanel',
};

const StateIcon: React.FC<{ state: TourHealthState }> = ({ state }) =>
  state === 'ok' ? (
    <CheckCircle2
      className="w-3.5 h-3.5 shrink-0 text-emerald-600"
      aria-hidden="true"
    />
  ) : state === 'needs-open' ? (
    <PanelTopOpen
      className="w-3.5 h-3.5 shrink-0 text-amber-600"
      aria-hidden="true"
    />
  ) : (
    <OctagonAlert
      className="w-3.5 h-3.5 shrink-0 text-red-600"
      aria-hidden="true"
    />
  );

const widgetNames = (set: GuidedLearningSet): string =>
  (set.tourSetup?.widgets ?? [])
    .map((type) => TOOLS.find((tool) => tool.type === type)?.label ?? type)
    .join(', ');

async function loadTour(id: string): Promise<LoadedTour | null> {
  const [draft, published, runs] = await Promise.all([
    loadBuildingSet(id).catch(() => null),
    loadPublishedTour(id).catch(() => null),
    loadTourRuns(id).catch(() => null),
  ]);
  if (!draft) return null;
  const version = published?.publishedAt ?? draft.updatedAt;
  return {
    draft,
    runs: published?.set ?? draft,
    published: !!published,
    field: runs ? fieldStatsOf(runs, version) : null,
  };
}

/** Admin view of every live tour's health: OK, needs a widget or panel open, or broken. */
const TourHealthPanel: React.FC = () => {
  const { t } = useTranslation();
  const { buildingSets, buildingLoading, saveBuildingSet } =
    useGuidedLearning(undefined);
  const [live, setLive] = useState<Map<string, boolean> | null>(null);
  // Held once, so a snapshot after an autosave doesn't hand the Studio a new set.
  const [studio, setStudio] = useState<{
    set: GuidedLearningSet;
    stepId: string;
  } | null>(null);

  const canRecord =
    useContext(AuthContext)?.canAccessFeature('gl-live-tours') ?? false;

  // The index says which sets have tours; only those are fetched, with their snapshot and runs.
  const tourKey = buildingSets
    .filter((entry) => entry.hasLiveTour)
    .map((entry) => `${entry.id}@${entry.updatedAt}`)
    .join(',');
  const [loaded, setLoaded] = useState<{
    key: string;
    tours: LoadedTour[];
  } | null>(null);
  useEffect(() => {
    if (buildingLoading) return;
    let cancelled = false;
    const ids = tourKey ? tourKey.split(',').map((k) => k.split('@')[0]) : [];
    void Promise.all(ids.map(loadTour)).then((tours) => {
      if (!cancelled) {
        setLoaded({
          key: tourKey,
          tours: tours.filter((x): x is LoadedTour => !!x),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tourKey, buildingLoading]);

  const tours = (loaded?.tours ?? [])
    .map((tour) => ({ ...tour, steps: tourHealthOf(tour.runs) }))
    .filter((tour) => tour.steps.length > 0);

  const titles = new Map(buildingSets.map((entry) => [entry.id, entry.title]));
  const openStep = async (setId: string, stepId: string) => {
    const set =
      loaded?.tours.find((tour) => tour.draft.id === setId)?.draft ??
      (await loadBuildingSet(setId).catch(() => null));
    if (set) setStudio({ set: { ...set, isBuilding: true }, stepId });
  };

  const checkLive = () =>
    setLive(
      checkAnchorsLive(tours.flatMap((tour) => tour.steps.map((h) => h.step)))
    );

  if (buildingLoading || loaded?.key !== tourKey) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t('tourHealth.loading')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('tourHealth.intro')}</p>
        <div className="flex shrink-0 items-center gap-2">
          {canRecord && (
            <button
              type="button"
              onClick={requestRecordTour}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"
            >
              <Circle className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              {t('tourHealth.recordTour')}
            </button>
          )}
          <button
            type="button"
            onClick={checkLive}
            disabled={tours.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Radar className="w-4 h-4" aria-hidden="true" />
            {t('tourHealth.checkLive')}
          </button>
        </div>
      </div>

      {canRecord && (
        <UnmappedAnchorsSection
          titles={titles}
          onOpenStep={(setId, stepId) => void openStep(setId, stepId)}
          loadSet={loadBuildingSet}
          saveSet={saveBuildingSet}
        />
      )}

      {tours.length === 0 && (
        <p className="text-sm text-slate-500">{t('tourHealth.empty')}</p>
      )}

      {tours.map(({ draft, runs: set, published, field, steps }) => {
        const title = set.title || t('tourHealth.untitledSet');
        const verdicts = steps.map((h) =>
          stepVerdict(h, set.tourSetup, field, live?.get(h.step.id))
        );
        const state = worstState(verdicts.map((v) => v.state));
        return (
          <section
            key={draft.id}
            aria-label={title}
            className="border border-slate-200 rounded-lg bg-white"
          >
            <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 border-b border-slate-100">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-900">
                  {title}
                </h4>
                <p className="text-xs text-slate-500">
                  {published
                    ? t('tourHealth.published')
                    : t('tourHealth.notPublished')}
                  {' · '}
                  {field
                    ? t('tourHealth.runSummary', {
                        runs: field.runs,
                        done: field.done,
                      })
                    : t('tourHealth.runsUnavailable')}
                </p>
              </div>
              <span
                data-testid="tour-state"
                className="flex items-center gap-1 text-xs font-semibold text-slate-700"
              >
                <StateIcon state={state} />
                {t(STATE_KEY[state])}
              </span>
            </header>
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 font-semibold">
                    {t('tourHealth.colStep')}
                  </th>
                  <th className="px-3 py-1.5 font-semibold">
                    {t('tourHealth.colAnchor')}
                  </th>
                  <th className="px-3 py-1.5 font-semibold">
                    {t('tourHealth.colStatus')}
                  </th>
                  <th className="px-3 py-1.5 font-semibold">
                    {t('tourHealth.colOnScreen')}
                  </th>
                  <th className="px-3 py-1.5">
                    <span className="sr-only">
                      {t('tourHealth.colActions')}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {steps.map(({ step, number }, i) => {
                  const { state: stepState, reason } = verdicts[i];
                  const found = live?.get(step.id);
                  const stepTitle = step.label?.trim()
                    ? step.label
                    : t('tourHealth.untitledStep');
                  return (
                    <tr key={step.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-700">
                        {number}. {stepTitle}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-slate-600">
                        {step.tour.anchor}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        <span className="flex items-center gap-1 font-semibold">
                          <StateIcon state={stepState} />
                          {t(STATE_KEY[stepState])}
                        </span>
                        {reason && (
                          <span className="block text-slate-500">
                            {t(REASON_KEY[reason], {
                              misses: field?.misses.get(step.id) ?? 0,
                              runs: field?.runs ?? 0,
                              widgets: widgetNames(set),
                            })}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {found === undefined
                          ? t('tourHealth.notChecked')
                          : found
                            ? t('tourHealth.found')
                            : t('tourHealth.notFound')}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setStudio({
                              set: { ...draft, isBuilding: true },
                              stepId: step.id,
                            })
                          }
                          aria-label={t('tourHealth.openInStudioLabel', {
                            number,
                            title,
                          })}
                          className="rounded-md px-2 py-1 font-semibold text-brand-blue-primary hover:bg-slate-100"
                        >
                          {t('tourHealth.openInStudio')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      {studio && (
        <Suspense fallback={null}>
          <GuidedLearningStudio
            key={studio.set.id}
            set={studio.set}
            meta={null}
            initialStepId={studio.stepId}
            onClose={() => setStudio(null)}
            onSave={(next, _driveFileId, guard) => saveBuildingSet(next, guard)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default TourHealthPanel;
