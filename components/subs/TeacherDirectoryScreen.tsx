import React, { useMemo } from 'react';
import { ArrowLeft, GraduationCap, Loader2, School } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useSubstituteShares } from '@/hooks/useSubstituteShares';
import { BUILDINGS, canonicalBuildingId } from '@/config/buildings';
import { useSubCollectionShares } from './useSubCollectionShares';
import { buildDirectoryEntries } from './subDirectory';
import { SubDirectoryCard } from './SubDirectoryCard';

interface TeacherDirectoryScreenProps {
  buildingId: string;
  onPickBoard: (shareId: string) => void;
  /** Open a Board nested inside a shared Collection (shareId + boardId). */
  onPickCollectionBoard: (shareId: string, boardId: string) => void;
  onChangeBuilding: () => void;
}

export const TeacherDirectoryScreen: React.FC<TeacherDirectoryScreenProps> = ({
  buildingId,
  onPickBoard,
  onPickCollectionBoard,
  onChangeBuilding,
}) => {
  const adminBuildings = useAdminBuildings();
  const building = useMemo(() => {
    const source = adminBuildings.length > 0 ? adminBuildings : BUILDINGS;
    const canonical = canonicalBuildingId(buildingId);
    return source.find((b) => canonicalBuildingId(b.id) === canonical);
  }, [adminBuildings, buildingId]);

  const { t } = useTranslation();
  const {
    shares,
    loading: boardsLoading,
    error,
  } = useSubstituteShares(buildingId);
  const {
    collections,
    loading: collectionsLoading,
    errored: collectionsErrored,
  } = useSubCollectionShares(buildingId);
  const loading = boardsLoading || collectionsLoading;
  const entries = useMemo(
    () => buildDirectoryEntries(shares, collections),
    [shares, collections]
  );
  const boardCount = entries.filter((e) => e.kind !== 'collection').length;
  const collectionCount = entries.length - boardCount;
  const countLabel = [
    boardCount > 0 && `${boardCount} ${boardCount === 1 ? 'board' : 'boards'}`,
    collectionCount > 0 &&
      `${collectionCount} ${collectionCount === 1 ? 'collection' : 'collections'}`,
  ]
    .filter(Boolean)
    .join(', ');

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">SpartBoard</div>
            <div className="text-[11px] text-white/60 -mt-0.5">
              Substitute Portal
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onChangeBuilding}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1.5 text-xs text-white/80 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Change building
        </button>
      </header>

      <main className="flex-1 px-8 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] text-white/70 uppercase tracking-wider mb-2">
                <School className="w-3.5 h-3.5" />
                {building?.name ?? 'Unknown building'}
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Boards available today
              </h1>
              <p className="mt-1 text-sm text-white/60">{today}</p>
            </div>
            <div className="text-xs text-white/50">
              {loading
                ? 'Loading…'
                : countLabel && `${countLabel} shared with subs`}
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-200">
              Couldn&apos;t load boards: {error}
            </div>
          )}

          {collectionsErrored && (
            <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-200">
              {t('subCollections.loadError', {
                defaultValue:
                  "Couldn't load shared Collections. Refresh to try again.",
              })}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24 text-white/50">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-12 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <School className="w-7 h-7 text-white/40" />
              </div>
              <h2 className="text-lg font-bold text-white">
                No boards shared yet
              </h2>
              <p className="mt-2 text-sm text-white/60 max-w-md mx-auto">
                No teachers in this building have shared a substitute board
                today. Check with the office or try a different building.
              </p>
              <button
                type="button"
                onClick={onChangeBuilding}
                className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change building
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {entries.map((entry) => (
                <SubDirectoryCard
                  key={entry.key}
                  entry={entry}
                  buildingName={building?.name ?? ''}
                  onPickBoard={onPickBoard}
                  onPickCollectionBoard={onPickCollectionBoard}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
