import React from 'react';
import { GraduationCap, LogOut, School } from 'lucide-react';
import type { MockBuilding } from './subsMockData';

interface BuildingPickerScreenProps {
  buildings: MockBuilding[];
  onPick: (buildingId: string) => void;
}

export const BuildingPickerScreen: React.FC<BuildingPickerScreenProps> = ({
  buildings,
  onPick,
}) => {
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
        <div className="flex items-center gap-3 text-xs text-white/70">
          <span>
            Signed in as{' '}
            <span className="text-white font-medium">
              ohssub@orono.k12.mn.us
            </span>
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 transition-colors cursor-pointer"
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
          <p className="mt-3 text-sm text-white/60">
            Pick a building to see teachers who&apos;ve handed off a board for
            you.
          </p>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {buildings.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onPick(b.id)}
                className="group relative text-left rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 hover:border-white/30 transition-all p-5 focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-blue-light to-brand-blue-primary flex items-center justify-center shadow-lg shadow-brand-blue-primary/30">
                  <School className="w-6 h-6 text-white" />
                </div>
                <div className="mt-4">
                  <div className="text-base font-bold text-white leading-tight">
                    {b.name}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-white/50 font-medium">
                    Grades {b.gradeLabel}
                  </div>
                </div>
                <div className="mt-4 text-xs text-brand-blue-lighter group-hover:text-white transition-colors">
                  Continue →
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>

      <footer className="px-8 py-4 text-[11px] text-white/40 text-center">
        Boards expire automatically. Anything you do here stays on this device.
      </footer>
    </div>
  );
};
