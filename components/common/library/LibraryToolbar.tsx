import React, { useRef, useState } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  List as ListIcon,
  Check,
  ChevronDown,
} from 'lucide-react';
import type {
  LibraryToolbarProps,
  LibrarySortDir,
  LibraryViewMode,
} from './types';
import { useClickOutside } from '@/hooks/useClickOutside';

const SortDropdown: React.FC<{
  sort: LibraryToolbarProps['sort'];
  sortOptions: LibraryToolbarProps['sortOptions'];
  onSortChange: LibraryToolbarProps['onSortChange'];
}> = ({ sort, sortOptions, onSortChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const active = sortOptions.find((o) => o.key === sort.key);
  const toggleDir = () => {
    const next: LibrarySortDir = sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ key: sort.key, dir: next });
  };

  return (
    <div ref={ref} className="relative">
      <div className="inline-flex items-stretch rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="inline-flex items-center font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          style={{
            gap: 'min(8px, 2cqmin)',
            paddingInline: 'min(12px, 3cqmin)',
            paddingBlock: 'min(6px, 1.5cqmin)',
            fontSize: 'min(14px, 5.5cqmin)',
          }}
        >
          <ArrowUpDown size={14} className="shrink-0 text-slate-500" />
          <span className="truncate">{active?.label ?? 'Sort'}</span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </button>
        <button
          type="button"
          onClick={toggleDir}
          aria-label={sort.dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
          className="inline-flex items-center justify-center border-l border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          style={{ paddingInline: 'min(10px, 2.5cqmin)' }}
        >
          {sort.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </button>
      </div>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-10 rounded-xl border border-slate-200 bg-white shadow-lg"
          style={{
            marginTop: 'min(4px, 1cqmin)',
            minWidth: 'min(192px, 48cqmin)',
            paddingBlock: 'min(4px, 1cqmin)',
          }}
        >
          {sortOptions.map((opt) => {
            const selected = opt.key === sort.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  const nextDir: LibrarySortDir =
                    opt.key === sort.key ? sort.dir : (opt.defaultDir ?? 'asc');
                  onSortChange({ key: opt.key, dir: nextDir });
                  setOpen(false);
                }}
                className={`flex items-center justify-between w-full text-left transition-colors ${
                  selected
                    ? 'bg-brand-blue-lighter/30 text-brand-blue-primary font-bold'
                    : 'text-slate-700 hover:bg-slate-50 font-medium'
                }`}
                style={{
                  paddingInline: 'min(12px, 3cqmin)',
                  paddingBlock: 'min(8px, 2cqmin)',
                  fontSize: 'min(14px, 5.5cqmin)',
                }}
              >
                <span className="truncate">{opt.label}</span>
                {selected && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const FilterDropdown: React.FC<{
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}> = ({ id, label, options, value, onChange }) => {
  const isActive = value !== '';
  return (
    <div className="relative inline-flex items-center">
      <select
        id={`library-filter-${id}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`appearance-none rounded-xl border bg-white shadow-sm font-bold transition-colors cursor-pointer hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30 ${
          isActive
            ? 'border-brand-blue-primary/40 text-brand-blue-primary'
            : 'border-slate-200 text-slate-700'
        }`}
        style={{
          paddingLeft: 'min(12px, 3cqmin)',
          paddingRight: 'min(32px, 8cqmin)',
          paddingBlock: 'min(6px, 1.5cqmin)',
          fontSize: 'min(14px, 5.5cqmin)',
        }}
      >
        <option value="">{label}: All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {label}: {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
    </div>
  );
};

const ViewModeToggle: React.FC<{
  viewMode: LibraryViewMode;
  onChange: (next: LibraryViewMode) => void;
}> = ({ viewMode, onChange }) => {
  const btn = (
    mode: LibraryViewMode,
    Icon: typeof LayoutGrid,
    label: string
  ) => {
    const selected = viewMode === mode;
    return (
      <button
        key={mode}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        title={label}
        onClick={() => onChange(mode)}
        className={`inline-flex items-center justify-center transition-colors ${
          selected
            ? 'bg-brand-blue-primary text-white'
            : 'text-slate-500 hover:bg-slate-50'
        }`}
        style={{
          paddingInline: 'min(10px, 2.5cqmin)',
          paddingBlock: 'min(6px, 1.5cqmin)',
        }}
      >
        <Icon size={14} />
      </button>
    );
  };
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex items-stretch rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
    >
      {btn('grid', LayoutGrid, 'Grid view')}
      {btn('list', ListIcon, 'List view')}
    </div>
  );
};

export const LibraryToolbar: React.FC<LibraryToolbarProps> = ({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  sort,
  sortOptions,
  onSortChange,
  filters,
  filterValues,
  onFilterChange,
  viewMode,
  onViewModeChange,
  rightSlot,
}) => {
  const visibleFilters = (filters ?? []).filter((f) => f.visible !== false);

  return (
    <div
      className="flex items-center flex-wrap"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      <div
        className="relative flex-1 max-w-md"
        style={{ minWidth: 'min(192px, 48cqmin)' }}
      >
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-slate-200 bg-white font-medium text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30 focus:border-brand-blue-primary/40"
          style={{
            paddingLeft: 'min(36px, 9cqmin)',
            paddingRight: 'min(12px, 3cqmin)',
            paddingBlock: 'min(6px, 1.5cqmin)',
            fontSize: 'min(14px, 5.5cqmin)',
          }}
        />
      </div>

      <SortDropdown
        sort={sort}
        sortOptions={sortOptions}
        onSortChange={onSortChange}
      />

      {visibleFilters.length > 0 &&
        onFilterChange &&
        visibleFilters.map((f) => (
          <FilterDropdown
            key={f.id}
            id={f.id}
            label={f.label}
            options={f.options}
            value={filterValues?.[f.id] ?? ''}
            onChange={(v) => onFilterChange(f.id, v)}
          />
        ))}

      {viewMode !== undefined && onViewModeChange && (
        <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
      )}

      {rightSlot && (
        <div className="ml-auto flex items-center">{rightSlot}</div>
      )}
    </div>
  );
};
