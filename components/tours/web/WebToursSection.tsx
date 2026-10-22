import React, { useEffect, useState } from 'react';
import type { GuidedLearningSet } from '@/types';
import { useAuth } from '@/context/useAuth';
import { tourAttr } from '@/config/tourAnchors';
import {
  saveWebTourDraft,
  watchWebTourDrafts,
} from '@/components/tours/webTours';
import { newWebTour } from './recordedSteps';
import { publishBlockers } from './webStepReview';
import { WebTourEditor } from './WebTourEditor';

/** Admin-only list of web tour drafts in the library's Live tours view, behind `web-tours`. */
export const WebToursSection: React.FC = () => {
  const { isAdmin, canAccessFeature } = useAuth();
  const enabled = isAdmin === true && canAccessFeature('web-tours');
  const [drafts, setDrafts] = useState<GuidedLearningSet[] | null>(null);
  const [open, setOpen] = useState<GuidedLearningSet | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    return watchWebTourDrafts(
      (sets) => {
        setError(false);
        setDrafts(sets.sort((a, b) => a.title.localeCompare(b.title)));
      },
      () => setError(true)
    );
  }, [enabled]);

  if (!enabled) return null;

  const create = async () => {
    const set = newWebTour();
    try {
      await saveWebTourDraft(set);
      setOpen(set);
    } catch {
      setError(true);
    }
  };

  return (
    <section
      aria-label="Web tours"
      className="flex flex-col border-b border-slate-200"
      style={{
        marginBottom: 'min(12px, 3cqmin)',
        paddingBottom: 'min(8px, 2cqmin)',
        fontSize: 'min(13px, 4cqmin)',
      }}
    >
      <div className="flex items-center gap-3">
        <h3 className="flex-1 font-semibold text-slate-900">Web tours</h3>
        <button
          type="button"
          className="font-semibold text-blue-700 hover:underline"
          onClick={() => void create()}
          {...tourAttr('web-tours.new')}
        >
          New web tour
        </button>
      </div>
      {error && <p className="text-red-700">Web tours couldn&apos;t load.</p>}
      {drafts && drafts.length === 0 && (
        <p className="text-slate-600">
          Tours of other websites, recorded with the SpartBoard Chrome
          extension.
        </p>
      )}
      <ul className="flex flex-col divide-y divide-slate-100">
        {(drafts ?? []).map((d) => {
          const ready = publishBlockers(d, null).length === 0;
          return (
            <li key={d.id}>
              {/* no-tour-anchor: one row per web tour draft */}
              <button
                type="button"
                className="flex w-full items-center gap-3 py-1.5 text-left hover:bg-slate-50"
                onClick={() => setOpen(d)}
              >
                <span className="min-w-0 flex-1 truncate text-slate-900">
                  {d.title || 'Untitled web tour'}
                </span>
                <span className="shrink-0 text-slate-500">
                  {d.steps.length} {d.steps.length === 1 ? 'step' : 'steps'}
                  {d.steps.length > 0 && !ready ? ', needs checking' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && <WebTourEditor initial={open} onClose={() => setOpen(null)} />}
    </section>
  );
};
