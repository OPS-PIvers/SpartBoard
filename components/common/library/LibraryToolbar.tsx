import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';
import type { LibraryToolbarProps, LibrarySortDir } from './types';
import { tourTypeAttr, tourFieldAttr } from '@/config/tourAnchors';
import { SearchField } from '@/components/common/SearchField';

// Icons track the toolbar's text size so a small widget's controls stay in proportion.
const ICON: React.CSSProperties = {
  width: 'min(14px, 5.5cqmin)',
  height: 'min(14px, 5.5cqmin)',
};

const SortDropdown: React.FC<{
  sort: LibraryToolbarProps['sort'];
  sortOptions: LibraryToolbarProps['sortOptions'];
  onSortChange: LibraryToolbarProps['onSortChange'];
  widgetType: string;
}> = ({ sort, sortOptions, onSortChange, widgetType }) => {
  const toggleDir = () => {
    const next: LibrarySortDir = sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ key: sort.key, dir: next });
  };

  return (
    <div className="inline-flex items-stretch rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      <div className="relative inline-flex items-center">
        <ArrowUpDown
          style={{ ...ICON, left: 'min(12px, 3cqmin)' }}
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-500"
        />
        <select
          value={sort.key}
          onChange={(e) => {
            const opt = sortOptions.find((o) => o.key === e.target.value);
            if (!opt) return;
            onSortChange({ key: opt.key, dir: opt.defaultDir ?? 'asc' });
          }}
          aria-label="Sort"
          {...tourTypeAttr('library-shell.sort', widgetType)}
          className="appearance-none bg-transparent font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary/30"
          style={{
            paddingLeft:
              'calc(min(12px, 3cqmin) + min(14px, 5.5cqmin) + min(8px, 2cqmin))',
            paddingRight: 'min(32px, 8cqmin)',
            paddingBlock: 'min(6px, 1.5cqmin)',
            fontSize: 'min(14px, 5.5cqmin)',
          }}
        >
          {sortOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          style={{ ...ICON, right: 'min(10px, 2.5cqmin)' }}
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
      <button
        type="button"
        onClick={toggleDir}
        {...tourTypeAttr('library-shell.sort-direction', widgetType)}
        aria-label={sort.dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
        title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
        className="inline-flex items-center justify-center border-l border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        style={{ paddingInline: 'min(10px, 2.5cqmin)' }}
      >
        {sort.dir === 'asc' ? (
          <ArrowUp style={ICON} />
        ) : (
          <ArrowDown style={ICON} />
        )}
      </button>
    </div>
  );
};

const FilterDropdown: React.FC<{
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  widgetType: string;
  rowIndex: number;
}> = ({ id, label, options, value, onChange, widgetType, rowIndex }) => {
  const isActive = value !== '';
  return (
    <div className="relative inline-flex items-center">
      <select
        id={`library-filter-${id}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        {...tourFieldAttr(
          'library-shell.filter',
          widgetType,
          `row-${rowIndex + 1}`
        )}
        className={`appearance-none rounded-xl border bg-white shadow-xs font-bold transition-colors cursor-pointer hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/30 ${
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
        style={{ ...ICON, right: 'min(10px, 2.5cqmin)' }}
        className="absolute top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
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
  rightSlot,
  widgetType = 'library',
}) => {
  const visibleFilters = (filters ?? []).filter((f) => f.visible !== false);

  return (
    <div
      className="flex items-center flex-wrap"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      <SearchField
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        anchor={tourTypeAttr('library-shell.search', widgetType)}
        size="scaled"
        className="flex-1 max-w-md"
        style={{ minWidth: 'min(192px, 48cqmin)' }}
      />

      <SortDropdown
        sort={sort}
        sortOptions={sortOptions}
        onSortChange={onSortChange}
        widgetType={widgetType}
      />

      {visibleFilters.length > 0 &&
        onFilterChange &&
        visibleFilters.map((f, i) => (
          <FilterDropdown
            key={f.id}
            id={f.id}
            label={f.label}
            options={f.options}
            value={filterValues?.[f.id] ?? ''}
            onChange={(v) => onFilterChange(f.id, v)}
            widgetType={widgetType}
            rowIndex={i}
          />
        ))}

      {rightSlot && (
        <div className="ml-auto flex items-center">{rightSlot}</div>
      )}
    </div>
  );
};
