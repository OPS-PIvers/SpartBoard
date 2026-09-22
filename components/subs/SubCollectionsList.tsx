import { type FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { canonicalBuildingId } from '@/config/buildings';
import { logError } from '@/utils/logError';
import type { SharedCollection } from '@/types';

interface SubCollectionsListProps {
  buildingId: string;
  /**
   * Open a Board that lives inside a shared Collection. Called with the
   * Collection's shareId and the Board's id; the parent (SubsApp) navigates
   * into the `collection-board` view, which loads the frozen snapshot via
   * `useSubstituteCollectionBoard`.
   */
  onPickBoard: (shareId: string, boardId: string) => void;
}

/** Matches useSubstituteShares: covers a stale-token race right after sign-in. */
const MAX_PERMISSION_DENIED_RETRIES = 3;

interface CollectionsSnapshot {
  buildingId: string;
  collections: SharedCollection[];
  errored: boolean;
}

export const SubCollectionsList: FC<SubCollectionsListProps> = ({
  buildingId,
  onPickBoard,
}) => {
  const { t } = useTranslation();
  // Keyed by building so `loading` is derived rather than reset in an effect.
  const [snapshot, setSnapshot] = useState<CollectionsSnapshot | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const retryCountRef = useRef(0);
  const prevBuildingRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const canonical = canonicalBuildingId(buildingId);
    // Reset only on a real building change — retryToken also re-runs this.
    if (prevBuildingRef.current !== canonical) {
      retryCountRef.current = 0;
      prevBuildingRef.current = canonical;
    }
    // Live, not one-shot: the teacher can end a share or push new boards while
    // the sub has the directory open, and both have to show up without a
    // refresh. Firestore evaluates a list query's rule against the QUERY, not
    // the matched docs: only equality-pinned fields carry a value, so the
    // `shared_collections` `allow list` rule gates @orono callers on
    // `intendedMode` alone. Expiry is therefore ours to enforce — the
    // `where('expiresAt','>')` constraint (composite index provisioned in
    // firestore.indexes.json) plus the client-side filter below. Mirrors
    // useSubstituteShares.ts.
    const q = query(
      collection(db, 'shared_collections'),
      where('intendedMode', '==', 'substitute'),
      where('buildingId', '==', canonical),
      where('expiresAt', '>', Date.now())
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        retryCountRef.current = 0;
        const now = Date.now();
        const docs: SharedCollection[] = [];
        snap.docs.forEach((d) => {
          const data = d.data() as SharedCollection;
          const expiresAt =
            typeof data.expiresAt === 'number' ? data.expiresAt : 0;
          if (expiresAt <= now) return;
          docs.push({ ...data, shareId: d.id });
        });
        setSnapshot({
          buildingId: canonical,
          collections: docs,
          errored: false,
        });
      },
      (err) => {
        if (
          err.code === 'permission-denied' &&
          retryCountRef.current < MAX_PERMISSION_DENIED_RETRIES
        ) {
          retryCountRef.current += 1;
          setSnapshot(null);
          setRetryToken((token) => token + 1);
          return;
        }
        logError('SubCollectionsList.subscribe', err, { buildingId });
        setSnapshot({ buildingId: canonical, collections: [], errored: true });
      }
    );
    return unsub;
  }, [buildingId, retryToken]);

  const canonical = canonicalBuildingId(buildingId);
  const settled =
    snapshot && snapshot.buildingId === canonical ? snapshot : null;
  const loading = settled === null;
  const errored = settled?.errored ?? false;
  const collections = settled?.collections ?? [];

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
                onClick={() => onPickBoard(c.shareId, boardId)}
                title={t('subCollections.openBoard', {
                  defaultValue: 'Open this board',
                })}
                className="text-left px-2 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/30 text-white transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                <span className="truncate">
                  {t('subCollections.boardPlaceholder', {
                    id: boardId.slice(-4),
                    defaultValue: 'Board …{{id}}',
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
