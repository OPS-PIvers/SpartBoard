import React, { lazy, Suspense, useContext, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Radar,
} from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { useGuidedLearning } from '@/hooks/useGuidedLearning';
import { AuthContext } from '@/context/AuthContextValue';
import { requestRecordTour } from '@/components/tours/tourState';
import {
  checkAnchorsLive,
  tourHealthOf,
  type AnchorProblem,
} from '@/components/tours/tourHealth';

const GuidedLearningStudio = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio').then(
    (m) => ({ default: m.GuidedLearningStudio })
  )
);

const PROBLEM_TEXT: Record<AnchorProblem, string> = {
  'unknown-anchor': 'Not in the anchor registry',
  'needs-widget-type': 'Missing its widget type',
  'unexpected-widget-type': 'Has a widget type this anchor does not take',
  'unknown-widget-type': 'Names a widget type that does not exist',
};

const OK_TEXT = 'Registered';

/** Admin list of live-tour steps whose anchors are unregistered or not on screen. */
const TourHealthPanel: React.FC = () => {
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
  const tours = buildingSets
    .map((set) => ({ set, steps: tourHealthOf(set) }))
    .filter((tour) => tour.steps.length > 0);

  const checkLive = () =>
    setLive(
      checkAnchorsLive(tours.flatMap((tour) => tour.steps.map((h) => h.step)))
    );

  if (buildingLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Loading tours...
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Checks every live-tour step against the anchor registry. Check live
          looks for each anchor on the board behind this window as it is now.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {canRecord && (
            <button
              type="button"
              onClick={requestRecordTour}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"
            >
              <Circle className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              Record a tour
            </button>
          )}
          <button
            type="button"
            onClick={checkLive}
            disabled={tours.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Radar className="w-4 h-4" aria-hidden="true" />
            Check live
          </button>
        </div>
      </div>

      {tours.length === 0 && (
        <p className="text-sm text-slate-500">
          No Guided Learning set has live-tour steps yet.
        </p>
      )}

      {tours.map(({ set, steps }) => {
        const broken = steps.filter(
          (h) => h.problem !== null || live?.get(h.step.id) === false
        ).length;
        return (
          <section
            key={set.id}
            aria-label={set.title}
            className="border border-slate-200 rounded-lg bg-white"
          >
            <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100">
              <h4 className="text-sm font-semibold text-slate-900">
                {set.title || 'Untitled set'}
              </h4>
              <span className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                {broken === 0 ? (
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {broken === 0
                  ? 'No broken anchors'
                  : `${broken} broken ${broken === 1 ? 'anchor' : 'anchors'}`}
              </span>
            </header>
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 font-semibold">Step</th>
                  <th className="px-3 py-1.5 font-semibold">Anchor</th>
                  <th className="px-3 py-1.5 font-semibold">Registry</th>
                  <th className="px-3 py-1.5 font-semibold">On screen</th>
                  <th className="px-3 py-1.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {steps.map(({ step, number, problem }) => {
                  const found = live?.get(step.id);
                  return (
                    <tr key={step.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-700">
                        {number}.{' '}
                        {step.label?.trim() ? step.label : 'Untitled step'}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-slate-600">
                        {step.tour.anchor}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        <span className="flex items-center gap-1">
                          {problem ? (
                            <AlertTriangle
                              className="w-3.5 h-3.5 text-amber-600"
                              aria-hidden="true"
                            />
                          ) : (
                            <CheckCircle2
                              className="w-3.5 h-3.5 text-emerald-600"
                              aria-hidden="true"
                            />
                          )}
                          {problem ? PROBLEM_TEXT[problem] : OK_TEXT}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {found === undefined
                          ? 'Not checked'
                          : found
                            ? 'Found'
                            : 'Not found'}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setStudio({
                              set: { ...set, isBuilding: true },
                              stepId: step.id,
                            })
                          }
                          aria-label={`Open in Studio: step ${number} of ${set.title || 'Untitled set'}`}
                          className="rounded-md px-2 py-1 font-semibold text-brand-blue-primary hover:bg-slate-100"
                        >
                          Open in Studio
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
            onSave={saveBuildingSet}
          />
        </Suspense>
      )}
    </div>
  );
};

export default TourHealthPanel;
