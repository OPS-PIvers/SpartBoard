import React, { useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  GraduationCap,
  LayoutGrid,
  Loader2,
  School,
} from 'lucide-react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useSubstituteShares } from '@/hooks/useSubstituteShares';
import { BUILDINGS, canonicalBuildingId } from '@/config/buildings';
import {
  formatExpiresAt,
  teacherCardAccent,
  teacherInitials,
} from './subsView';

interface TeacherDirectoryScreenProps {
  buildingId: string;
  onPickBoard: (shareId: string) => void;
  onChangeBuilding: () => void;
}

export const TeacherDirectoryScreen: React.FC<TeacherDirectoryScreenProps> = ({
  buildingId,
  onPickBoard,
  onChangeBuilding,
}) => {
  const adminBuildings = useAdminBuildings();
  const building = useMemo(() => {
    const source = adminBuildings.length > 0 ? adminBuildings : BUILDINGS;
    const canonical = canonicalBuildingId(buildingId);
    return source.find((b) => canonicalBuildingId(b.id) === canonical);
  }, [adminBuildings, buildingId]);

  const { shares, loading, error } = useSubstituteShares(buildingId);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-blue-dark text-white flex flex-col">
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
                : `${shares.length} ${shares.length === 1 ? 'board' : 'boards'} shared with subs`}
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-200">
              Couldn&apos;t load boards: {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24 text-white/50">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : shares.length === 0 ? (
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
              {shares.map((board) => {
                const widgetCount =
                  board.widgetCount ??
                  (Array.isArray(board.widgets) ? board.widgets.length : 0);
                const teacherName =
                  board.originalAuthorName ?? 'A teacher in this building';
                return (
                  <button
                    key={board.shareId}
                    type="button"
                    onClick={() => onPickBoard(board.shareId)}
                    className="group text-left rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 hover:border-white/30 transition-all p-5 focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer flex flex-col"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl ${teacherCardAccent(
                          board.shareId
                        )} flex items-center justify-center text-white font-bold text-base shadow-lg`}
                      >
                        {teacherInitials(teacherName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-bold text-white truncate">
                          {teacherName}
                        </div>
                        <div className="text-[11px] text-white/60 truncate">
                          {building?.name ?? ''}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg bg-black/20 border border-white/5 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-white/50 font-medium">
                        Board
                      </div>
                      <div className="text-sm font-medium text-white truncate">
                        {board.name ?? 'Untitled board'}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-[11px]">
                      <div className="inline-flex items-center gap-1 text-white/60">
                        <LayoutGrid className="w-3.5 h-3.5" />
                        {widgetCount} {widgetCount === 1 ? 'widget' : 'widgets'}
                      </div>
                      <div className="inline-flex items-center gap-1 text-amber-300/90">
                        <Clock className="w-3.5 h-3.5" />
                        {board.expiresAt
                          ? formatExpiresAt(board.expiresAt)
                          : ''}
                      </div>
                    </div>

                    <div className="mt-5 inline-flex items-center gap-1.5 self-start rounded-md bg-white/10 group-hover:bg-white/20 px-3 py-1.5 text-xs font-bold text-white transition-colors">
                      Open board
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
