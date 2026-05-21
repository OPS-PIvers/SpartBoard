import React from 'react';

interface SettingsSectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** Optional scope chip (e.g. "This board" / "All boards"), already localized. */
  scopeLabel?: string;
}

// Shared header for every Settings section so the rail's detail pane reads
// consistently: icon tile + title, an optional scope chip on the right that
// tells teachers whether a change follows them across boards, and an optional
// one-line description.
export const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({
  icon,
  title,
  description,
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
    {description && (
      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
        {description}
      </p>
    )}
  </div>
);
