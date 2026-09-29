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
    <div className="h-screen overflow-y-auto bg-slate-50 text-slate-900 flex flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-blue-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">SpartBoard</div>
            <div className="text-[11px] text-slate-500 -mt-0.5">
              Substitute Portal
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onChangeBuilding}
          className="inline-flex items-center gap-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1.5 text-xs transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Change building
        </button>
      </header>

      <main className="flex-1 px-8 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1 text-[11px] text-slate-600 uppercase tracking-wider mb-2">
                <School className="w-3.5 h-3.5" />
                {building?.name ?? 'Unknown building'}
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Boards available today
              </h1>
              <p className="mt-1 text-sm text-slate-500">{today}</p>
            </div>
            <div className="text-xs text-slate-500">
              {loading
                ? 'Loading…'
                : countLabel && `${countLabel} shared with subs`}
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t load boards: {error}
            </div>
          )}

          {collectionsErrored && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {t('subCollections.loadError', {
                defaultValue:
                  "Couldn't load shared Collections. Refresh to try again.",
              })}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <School className="w-7 h-7 text-slate-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                No boards shared yet
              </h2>
              <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
                No teachers in this building have shared a substitute board
                today. Check with the office or try a different building.
              </p>
              <button
                type="button"
                onClick={onChangeBuilding}
                className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
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
