import React from 'react';
import { Plus } from 'lucide-react';
import type { WidgetType } from '@/types';

export type PartnerCardFrameProps = {
  partner: WidgetType;
  /** Dock-facing partner name; titles the card and names the group. */
  name: string;
  present: boolean;
  addLabel: string;
  onAdd: () => void;
  id?: string;
  labelId?: string;
  /** Set when the caller does not render its own title row (legacy panels). */
  showTitle?: boolean;
  children: React.ReactNode;
};

// Shared card body for a setting that only acts through a sibling widget; the schema field and legacy panels both render it.
export const PartnerCardFrame: React.FC<PartnerCardFrameProps> = ({
  partner,
  name,
  present,
  addLabel,
  onAdd,
  id,
  labelId,
  showTitle = false,
  children,
}) => {
  const titleId = labelId ?? (id ? `${id}-title` : undefined);
  return (
    <div className={showTitle ? 'flex flex-col gap-1.5' : undefined}>
      {showTitle && (
        <span id={titleId} className="text-xs font-semibold text-slate-700">
          {name}
        </span>
      )}
      <div
        id={id}
        role="group"
        aria-labelledby={titleId}
        data-partner={partner}
        data-partner-present={present}
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1"
      >
        {children}
        {!present && (
          <div className="flex flex-col gap-2 pb-2">
            <button
              type="button"
              onClick={onAdd}
              className="self-start inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-light focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {addLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
