import React, { useMemo } from 'react';
import { GraduationCap, LogOut, School } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { BUILDINGS, canonicalBuildingId } from '@/config/buildings';

interface BuildingPickerScreenProps {
  onPick: (buildingId: string) => void;
}

export const BuildingPickerScreen: React.FC<BuildingPickerScreenProps> = ({
  onPick,
}) => {
  const { user, signOut } = useAuth();
  const adminBuildings = useAdminBuildings();
  const buildings = useMemo(() => {
    const source = adminBuildings.length > 0 ? adminBuildings : BUILDINGS;
    return source.map((b) => ({
      id: canonicalBuildingId(b.id),
      name: b.name,
      gradeLabel: b.gradeLabel,
    }));
  }, [adminBuildings]);

  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-50 text-slate-900 flex flex-col">
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
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>
            Signed in as{' '}
            <span className="text-slate-800 font-medium">
              {user?.email ?? 'unknown'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-16">
        <div className="max-w-3xl w-full text-center">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Which building are you subbing in today?
          </h1>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {buildings.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onPick(b.id)}
                className="group relative text-left rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-brand-blue-primary/40 shadow-sm hover:shadow-md transition-all p-5 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-brand-blue-primary flex items-center justify-center">
                  <School className="w-6 h-6 text-white" />
                </div>
                <div className="mt-4">
                  <div className="text-base font-bold text-slate-900 leading-tight">
                    {b.name}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                    {b.gradeLabel ? `Grades ${b.gradeLabel}` : ' '}
                  </div>
                </div>
                <div className="mt-4 text-xs font-medium text-brand-blue-primary group-hover:text-brand-blue-dark transition-colors">
                  Continue →
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};
