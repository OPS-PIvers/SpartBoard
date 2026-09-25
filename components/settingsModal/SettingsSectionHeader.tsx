import React from 'react';

interface SettingsSectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  /** Optional scope chip (e.g. "This board" / "All boards"), already localized. */
  scopeLabel?: string;
}

// Shared Settings section header: icon tile, title and an optional scope chip.
export const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({
  icon,
  title,
  scopeLabel,
}) => (
  <div className="mb-5">
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0">
        {icon}
      </div>
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      {scopeLabel && (
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
          {scopeLabel}
        </span>
      )}
    </div>
  </div>
);
