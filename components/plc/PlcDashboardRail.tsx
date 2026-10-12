// components/plc/PlcDashboardRail.tsx
import React from 'react';
import type { PlcSectionId } from './sections';
import { tourFieldAttr } from '@/config/tourAnchors';

export interface PlcRailItem<Id extends string = PlcSectionId> {
  id: Id;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}
interface PlcDashboardRailProps<Id extends string> {
  activeSection: Id;
  onSelect: (id: Id) => void;
  visibleSections: PlcRailItem<Id>[];
}
export const PlcDashboardRail = <Id extends string = PlcSectionId>({
  activeSection,
  onSelect,
  visibleSections,
}: PlcDashboardRailProps<Id>): React.ReactElement => (
  <nav
    role="tablist"
    aria-orientation="vertical"
    className="hidden md:flex flex-col md:w-[76px] lg:w-56 shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto p-2 gap-0.5"
  >
    {visibleSections.map((s) => {
      const active = s.id === activeSection;
      return (
        <button
          {...tourFieldAttr('plc-dashboard.section-tab', 'plc', s.id)}
          key={s.id}
          id={`plc-tab-${s.id}`}
          role="tab"
          aria-selected={active}
          aria-controls={`plc-panel-${s.id}`}
          tabIndex={active ? 0 : -1}
          onClick={() => onSelect(s.id)}
          title={s.label}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors justify-center lg:justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
            active
              ? 'bg-brand-blue-primary text-white font-semibold shadow-sm'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <s.icon className="w-5 h-5 shrink-0" />
          <span className="hidden lg:inline truncate">{s.label}</span>
        </button>
      );
    })}
  </nav>
);
