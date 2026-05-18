import { type FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { canonicalBuildingId } from '@/config/buildings';
import { logError } from '@/utils/logError';
import type { SharedCollection } from '@/types';

interface SubCollectionsListProps {
  buildingId: string;
}

export const SubCollectionsList: FC<SubCollectionsListProps> = ({
  buildingId,
}) => {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<SharedCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canonical = canonicalBuildingId(buildingId);
    void (async () => {
      try {
        const q = query(
          collection(db, 'shared_collections'),
          where('intendedMode', '==', 'substitute'),
          where('buildingId', '==', canonical),
          where('expiresAt', '>', Date.now())
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const docs: SharedCollection[] = [];
        snap.docs.forEach((d) => {
          const data = d.data() as SharedCollection;
          docs.push({ ...data, shareId: d.id });
        });
        setCollections(docs);
        setErrored(false);
      } catch (err) {
        logError('SubCollectionsList.load', err, { buildingId });
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  if (loading) {
    return (
      <p className="text-sm text-white/50 italic">
        {t('subCollections.loading', {
          defaultValue: 'Loading shared Collections…',
        })}
      </p>
    );
  }

  // A total query failure (network, rules, missing index in production)
  // must not silently render an empty pane — a sub who's expecting a
  // Collection would assume nothing was shared.
  if (errored) {
    return (
      <p className="text-sm text-rose-300/80 italic">
        {t('subCollections.loadError', {
          defaultValue: "Couldn't load shared Collections — refresh to retry.",
        })}
      </p>
    );
  }

  if (collections.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-white/50">
        {t('subCollections.heading', { defaultValue: 'Collections' })}
      </h3>
      {collections.map((c) => (
        <div
          key={c.shareId}
          className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Folder
              className="w-4 h-4 flex-shrink-0"
              style={
                c.collection.color ? { color: c.collection.color } : undefined
              }
            />
            <span className="text-sm font-bold text-white">
              {c.collection.name}
            </span>
            <span className="ml-auto text-[11px] text-white/50">
              {t('subCollections.boardCount', {
                count: c.boardIds.length,
                defaultValue: '{{count}} board(s)',
              })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {c.boardIds.map((boardId) => (
              <button
                key={boardId}
                type="button"
                disabled
                title={t('subCollections.comingSoon', {
                  defaultValue:
                    'Board view in /subs coming soon — open in the teacher app for now',
                })}
                className="text-left px-2 py-1.5 text-xs rounded-md bg-slate-50 border border-slate-200 opacity-60 cursor-not-allowed flex flex-col gap-0.5"
                aria-disabled="true"
              >
                <span>
                  {t('subCollections.boardPlaceholder', {
                    id: boardId.slice(-4),
                    defaultValue: 'Board …{{id}}',
                  })}
                </span>
                <span className="text-[10px] text-slate-400 italic">
                  {t('subCollections.comingSoonLabel', {
                    defaultValue: 'Coming soon',
                  })}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};
