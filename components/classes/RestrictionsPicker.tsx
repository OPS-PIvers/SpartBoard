import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, UserX } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

export interface RestrictionsPickerCandidate {
  id: string;
  label: string;
}

interface RestrictionsPickerProps {
  candidates: RestrictionsPickerCandidate[];
  selectedIds: string[];
  onToggle: (otherId: string) => void;
}

/**
 * Per-row popover listing every other student in the class, each with a
 * checkbox. Toggling one fires `onToggle`, which is expected to apply the
 * bidirectional mirror at the modal level so both rows stay in sync.
 */
export const RestrictionsPicker: React.FC<RestrictionsPickerProps> = ({
  candidates,
  selectedIds,
  onToggle,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  useClickOutside(wrapperRef, () => setOpen(false));

  // Return focus to the trigger when the popover closes (WCAG 2.4.3).
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.label.toLowerCase().includes(q));
  }, [candidates, filter]);

  const count = selectedSet.size;
  const label =
    count === 0
      ? t('sidebar.classes.restrictionsNone', {
          defaultValue: 'No restrictions',
        })
      : t('sidebar.classes.restrictionsCount', {
          count,
          defaultValue: '{{count}} restricted',
          defaultValue_other: '{{count}} restricted',
        });

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`w-full flex items-center justify-between gap-1.5 px-2 py-1.5 text-xs font-bold rounded-md border transition-colors ${
          count > 0
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
            : 'border-slate-200 bg-white text-slate-500 hover:border-amber-300 hover:text-amber-700'
        }`}
      >
        <span className="flex items-center gap-1.5 truncate">
          <UserX size={12} className="shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('sidebar.classes.restrictionsPickerLabel', {
            defaultValue: 'Restrict from working together',
          })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="absolute top-full right-0 mt-1 w-72 max-h-80 flex flex-col z-popover rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="p-2 border-b border-slate-200 flex items-center gap-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('sidebar.classes.restrictionsFilter', {
                defaultValue: 'Search classmates…',
              })}
              className="flex-1 min-w-0 text-sm text-slate-800 placeholder:text-slate-400 bg-transparent outline-none"
              autoFocus
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs italic text-slate-400">
                {candidates.length === 0
                  ? t('sidebar.classes.restrictionsEmptyRoster', {
                      defaultValue: 'Add more students to set restrictions.',
                    })
                  : t('sidebar.classes.restrictionsNoMatches', {
                      defaultValue: 'No matches.',
                    })}
              </div>
            ) : (
              <ul>
                {filtered.map((c) => {
                  const checked = selectedSet.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-800 cursor-pointer hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(c.id)}
                          className="accent-amber-500"
                        />
                        <span className="truncate">{c.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {count > 0 && (
            <div className="p-2 border-t border-slate-200 text-xxs text-slate-500 italic">
              {t('sidebar.classes.restrictionsFooter', {
                defaultValue:
                  'Restrictions apply to both students automatically.',
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
