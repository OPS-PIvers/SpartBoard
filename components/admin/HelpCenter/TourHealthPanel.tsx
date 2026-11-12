import React, { useContext, useEffect, useMemo, useState } from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  OctagonAlert,
  PanelTopOpen,
  Radar,
} from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { DashboardContext } from '@/context/DashboardContextValue';
import { buildNameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import { TOOLS } from '@/config/tools';
import { loadPublishedTour } from '@/components/tours/publishedTours';
import { loadTourRuns } from '@/components/tours/tourRuns';
import {
  checkAnchorsLive,
  fieldStatsOf,
  stepVerdict,
  tourHealthOf,
  valueWarning,
  worstState,
  type StepHealthReason,
  type StepValueWarning,
  type TourFieldStats,
  type TourHealthState,
} from '@/components/tours/tourHealth';
import { requestEditTour } from '@/components/tours/editor/tourEditStore';
import { isWebTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';

interface LoadedTour {
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
  'needs-field-key': 'tourHealth.reason.needsFieldKey',
  'unexpected-widget-type': 'tourHealth.reason.unexpectedWidgetType',
  'unknown-widget-type': 'tourHealth.reason.unknownWidgetType',
  'field-misses': 'tourHealth.reason.fieldMisses',
  'not-on-screen': 'tourHealth.reason.notOnScreen',
  'needs-widget': 'tourHealth.reason.needsWidget',
  'widget-not-added': 'tourHealth.reason.widgetNotAdded',
  'needs-panel': 'tourHealth.reason.needsPanel',
};

const VALUE_WARNING_KEY: Record<StepValueWarning, string> = {
  'empty-value': 'tourHealth.valueWarning.emptyValue',
  'roster-name': 'tourHealth.valueWarning.rosterName',
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
  if (!draft || isWebTourSet(draft) || isWebTourSet(published?.set))
    return null;
  const version = published?.publishedAt ?? draft.updatedAt;
  return {
    runs: published?.set ?? draft,
    published: !!published,
    field: runs ? fieldStatsOf(runs, version) : null,
  };
}

interface TourHealthPanelProps {
  setId: string;
  /** The set's last save; a change reloads its health. */
  updatedAt?: number;
}

/** One Live tour's health in the Help Center detail pane: state, real runs and each step's verdict (H18). */
const TourHealthPanel: React.FC<TourHealthPanelProps> = ({
  setId,
  updatedAt,
}) => {
  const { t } = useTranslation();
  const [live, setLive] = useState<{
    key: string;
    found: Map<string, boolean>;
  } | null>(null);

  const rosters = useContext(DashboardContext)?.rosters;
  const matcher = useMemo(
    () => buildNameMatcher((rosters ?? []).flatMap((r) => r.students)),
    [rosters]
  );

  const loadKey = `${setId}@${updatedAt ?? ''}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    tour: LoadedTour | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadTour(setId).then((tour) => {
      if (!cancelled) setLoaded({ key: loadKey, tour });
    });
    return () => {
      cancelled = true;
    };
  }, [setId, loadKey]);

  if (loaded?.key !== loadKey) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t('tourHealth.loading')}
      </p>
    );
  }

  const tour = loaded.tour;
  if (!tour) return null;
  const { runs: set, published, field } = tour;
  const steps = tourHealthOf(set);
  if (steps.length === 0) return null;

  // A check from before the set changed would mark the wrong steps.
  const found = live?.key === loadKey ? live.found : undefined;
  const title = set.title || t('tourHealth.untitledSet');
  const verdicts = steps.map((h) =>
    stepVerdict(h, set.tourSetup, field, found?.get(h.step.id))
  );
  const state = worstState(verdicts.map((v) => v.state));

  const checkLive = () =>
    setLive({
      key: loadKey,
      found: checkAnchorsLive(steps.map((h) => h.step)),
    });

  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span
            data-testid="tour-state"
            className="flex items-center gap-1 text-sm font-semibold text-slate-800"
          >
            <StateIcon state={state} />
            {t(STATE_KEY[state])}
          </span>
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
        <button
          type="button"
          onClick={checkLive}
          {...tourAttr('admin.help-center.check-live')}
          className="flex shrink-0 items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"
        >
          <Radar className="w-4 h-4" aria-hidden="true" />
          {t('tourHealth.checkLive')}
        </button>
      </div>

      <ol className="divide-y divide-slate-100 text-xs">
        {steps.map(({ step, number }, i) => {
          const { state: stepState, reason } = verdicts[i];
          const onScreen = found?.get(step.id);
          const warning = valueWarning(step.tour, matcher);
          const stepTitle = step.label?.trim()
            ? step.label
            : t('tourHealth.untitledStep');
          return (
            <li
              key={step.id}
              data-testid="tour-step"
              className="flex items-start gap-3 py-2"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-slate-800">
                  {number}. {stepTitle}
                </p>
                <p className="font-mono text-slate-500 break-all">
                  {step.tour.anchor}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-slate-700">
                  <span className="flex items-center gap-1 font-semibold">
                    <StateIcon state={stepState} />
                    {t(STATE_KEY[stepState])}
                  </span>
                  <span className="text-slate-500">
                    {onScreen === undefined
                      ? t('tourHealth.notChecked')
                      : onScreen
                        ? t('tourHealth.found')
                        : t('tourHealth.notFound')}
                  </span>
                </p>
                {reason && (
                  <p className="text-slate-500">
                    {t(REASON_KEY[reason], {
                      misses: field?.misses.get(step.id) ?? 0,
                      runs: field?.runs ?? 0,
                      widgets: widgetNames(set),
                    })}
                  </p>
                )}
                {warning && (
                  <p
                    data-testid="tour-value-warning"
                    className="flex items-center gap-1 font-semibold text-amber-800"
                  >
                    <AlertTriangle
                      className="w-3.5 h-3.5 shrink-0 text-amber-600"
                      aria-hidden="true"
                    />
                    {t(VALUE_WARNING_KEY[warning])}
                  </p>
                )}
              </div>
              <button
                type="button"
                {...tourFieldAttr(
                  'admin.help-center.edit-step',
                  'help',
                  step.id
                )}
                onClick={() =>
                  requestEditTour({
                    setId,
                    stepId: step.id,
                    origin: 'help-center',
                  })
                }
                aria-label={t('tourHealth.editStepLabel', { number, title })}
                className="shrink-0 rounded-md px-2 py-1 font-semibold text-brand-blue-primary hover:bg-slate-100"
              >
                {t('tourHealth.editStep')}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default TourHealthPanel;
