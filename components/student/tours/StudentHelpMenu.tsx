import React from 'react';
import { Footprints } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { HelpResourceItem } from '@/types/helpCenter';

interface StudentHelpMenuProps {
  id: string;
  tours: readonly HelpResourceItem[];
  onPlay: (item: HelpResourceItem) => void;
}

const ROW_CLASS =
  'w-full flex items-center gap-3 px-4 py-2.5 min-h-11 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:bg-slate-50';

/** The student Help menu: this student's live tours, by title. */
export const StudentHelpMenu: React.FC<StudentHelpMenuProps> = ({
  id,
  tours,
  onPlay,
}) => (
  <div
    id={id}
    role="menu"
    aria-label="Help"
    className="absolute right-0 bottom-full mb-2 w-[min(18rem,calc(100vw-2rem))] max-h-[60vh] overflow-y-auto py-1 rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/15"
  >
    {tours.map((item, i) => (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        onClick={() => onPlay(item)}
        className={ROW_CLASS}
        {...tourFieldAttr('student.help-tour', 'student-help', `row-${i + 1}`)}
      >
        <Footprints
          className="w-4 h-4 shrink-0 text-brand-blue-primary"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 leading-snug">{item.title}</span>
      </button>
    ))}
  </div>
);
