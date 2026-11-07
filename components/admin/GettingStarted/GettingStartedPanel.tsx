// Admin card for `admin_settings/getting_started`: which tours, in what order and tier (D17).
import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { ArrowDown, ArrowUp, Footprints, Loader2, Plus, X } from 'lucide-react';
import { db } from '@/config/firebase';
import {
  GETTING_STARTED_DONE_WHEN,
  GETTING_STARTED_MAX_TOURS,
  GETTING_STARTED_SETTINGS_DOC,
  moveGettingStartedEntry,
  type GettingStartedDoneWhen,
  type GettingStartedEntry,
  type GettingStartedTier,
} from '@/config/gettingStarted';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { useAuth } from '@/context/useAuth';
import { useGettingStartedSettings } from '@/hooks/useGettingStarted';
import { useHelpResources } from '@/hooks/useHelpResources';
import { useLiveTourSetIds } from '@/hooks/useGuidedLearning';

const selectClass =
  'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40';
const iconButtonClass =
  'relative touch-target-expand p-1.5 rounded-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40';

const TIER_LABELS: Record<GettingStartedTier, string> = {
  essentials: 'Essentials',
  next: 'Next steps',
};

const DONE_WHEN_LABELS: Record<GettingStartedDoneWhen, string> = {
  finished: 'Tour finished',
  building: 'A building saved',
  drive: 'Drive stays connected',
  classes: 'A class added',
};

export const GettingStartedPanel: React.FC = () => {
  const { user } = useAuth();
  const { tours, loading } = useGettingStartedSettings();
  const { items, loading: itemsLoading } = useHelpResources({
    includeHidden: false,
  });
  const liveSetIds = useLiveTourSetIds();
  const [picked, setPicked] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleOf = (itemId: string): string | null =>
    items.find((item) => item.id === itemId)?.title ?? null;

  const persist = async (next: GettingStartedEntry[]) => {
    setSaving(true);
    setError(null);
    try {
      // Merged so the sidebar switch on the Previews tab survives.
      await setDoc(
        doc(db, 'admin_settings', GETTING_STARTED_SETTINGS_DOC),
        {
          tours: next,
          // eslint-disable-next-line react-hooks/purity -- runs in an async save handler, not render
          updatedAt: Date.now(),
          updatedBy: user?.email ?? '',
        },
        { merge: true }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const update = (itemId: string, change: Partial<GettingStartedEntry>) =>
    void persist(
      tours.map((entry) =>
        entry.itemId === itemId ? { ...entry, ...change } : entry
      )
    );

  const listed = new Set(tours.map((entry) => entry.itemId));
  const options = items.filter(
    (item) =>
      item.kind === 'guided-learning' &&
      !!item.setId &&
      liveSetIds.has(item.setId) &&
      !listed.has(item.id)
  );
  const full = tours.length >= GETTING_STARTED_MAX_TOURS;

  const add = () => {
    if (!picked || full) return;
    setPicked('');
    void persist([
      ...tours,
      { itemId: picked, tier: 'next', doneWhen: 'finished' },
    ]);
  };

  const renderRow = (entry: GettingStartedEntry) => {
    const title = titleOf(entry.itemId);
    const name = title ?? 'Guide not available';
    return (
      <li key={entry.itemId} className="flex flex-wrap items-center gap-2 py-2">
        <span
          className={`flex-1 min-w-48 break-words text-sm ${
            title ? 'font-semibold text-slate-900' : 'text-red-700'
          }`}
        >
          {itemsLoading ? '…' : name}
        </span>
        <select
          {...tourFieldAttr(
            'admin.getting-started.tier',
            'admin',
            entry.itemId
          )}
          aria-label={`Tier for ${name}`}
          value={entry.tier}
          disabled={saving}
          onChange={(e) =>
            update(entry.itemId, {
              tier: e.target.value as GettingStartedTier,
            })
          }
          className={selectClass}
        >
          {Object.entries(TIER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          {...tourFieldAttr(
            'admin.getting-started.done-when',
            'admin',
            entry.itemId
          )}
          aria-label={`Checks off for ${name}`}
          title="What checks this tour off"
          value={entry.doneWhen}
          disabled={saving}
          onChange={(e) =>
            update(entry.itemId, {
              doneWhen: e.target.value as GettingStartedDoneWhen,
            })
          }
          className={selectClass}
        >
          {GETTING_STARTED_DONE_WHEN.map((value) => (
            <option key={value} value={value}>
              {DONE_WHEN_LABELS[value]}
            </option>
          ))}
        </select>
        <button
          {...tourFieldAttr(
            'admin.getting-started.move-up',
            'admin',
            entry.itemId
          )}
          type="button"
          disabled={saving}
          onClick={() =>
            void persist(moveGettingStartedEntry(tours, entry.itemId, -1))
          }
          aria-label={`Move ${name} up`}
          className={iconButtonClass}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          {...tourFieldAttr(
            'admin.getting-started.move-down',
            'admin',
            entry.itemId
          )}
          type="button"
          disabled={saving}
          onClick={() =>
            void persist(moveGettingStartedEntry(tours, entry.itemId, 1))
          }
          aria-label={`Move ${name} down`}
          className={iconButtonClass}
        >
          <ArrowDown className="w-4 h-4" />
        </button>
        <button
          {...tourFieldAttr(
            'admin.getting-started.remove',
            'admin',
            entry.itemId
          )}
          type="button"
          disabled={saving}
          onClick={() =>
            void persist(tours.filter((other) => other.itemId !== entry.itemId))
          }
          aria-label={`Remove ${name}`}
          className={iconButtonClass}
        >
          <X className="w-4 h-4" />
        </button>
      </li>
    );
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
          <Footprints className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Getting Started</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <>
          {tours.length === 0 && (
            <p className="text-sm text-slate-500">
              No tours yet. Add a Help Center live tour below.
            </p>
          )}
          {(['essentials', 'next'] as const).map((tier) => {
            const rows = tours.filter((entry) => entry.tier === tier);
            return (
              rows.length > 0 && (
                <section key={tier} className="mb-6">
                  <h3 className="text-sm font-bold text-slate-900">
                    {TIER_LABELS[tier]}
                  </h3>
                  <ul className="mt-1 divide-y divide-slate-200 border-y border-slate-200">
                    {rows.map(renderRow)}
                  </ul>
                </section>
              )
            );
          })}

          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <select
              {...tourAttr('admin.getting-started.pick-tour')}
              aria-label="Tour to add"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className={`${selectClass} flex-1 min-w-48`}
            >
              <option value="">Choose a live tour</option>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <button
              {...tourAttr('admin.getting-started.add')}
              type="submit"
              disabled={saving || !picked || full}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-blue-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
};
