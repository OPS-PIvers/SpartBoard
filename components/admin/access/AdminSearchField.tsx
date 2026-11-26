import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { ArrowRight } from 'lucide-react';
import { SearchField } from '@/components/common/SearchField';
import { useAccessSearch } from './accessSearchContext';
import {
  ACCESS_TAB_LABELS,
  countAccessMatches,
  type AccessTabId,
  type GraduatedSet,
} from './accessSearch';

export const AdminSearchField: React.FC<{
  tab: AccessTabId;
  placeholder: string;
}> = ({ tab, placeholder }) => {
  const { query, setQuery } = useAccessSearch();
  return (
    <div className="sticky top-0 z-10 -mx-1 px-1 pb-2 bg-slate-50">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
        testId={`access-search-${tab}`}
        anchor={tourFieldAttr('admin.access.search', 'admin', tab)}
      />
    </div>
  );
};

/** Empty-result state that links to the other Access tabs that do match. */
export const AccessSearchEmpty: React.FC<{
  tab: AccessTabId;
  fallback: string;
  graduated?: GraduatedSet;
  graduatedSwitches?: ReadonlySet<string>;
}> = ({ tab, fallback, graduated, graduatedSwitches }) => {
  const { query, goToTab } = useAccessSearch();
  const counts = countAccessMatches(query, graduated, graduatedSwitches);
  const elsewhere = query.trim()
    ? (Object.keys(counts) as AccessTabId[]).filter(
        (t) => t !== tab && counts[t] > 0
      )
    : [];
  return (
    <div className="py-12 text-center text-slate-500">
      <p className="font-medium">
        {query.trim() ? `No matches for "${query.trim()}".` : fallback}
      </p>
      {goToTab && elsewhere.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {elsewhere.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => goToTab(t)}
              {...tourFieldAttr('admin.access.search-elsewhere', 'admin', t)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-brand-blue-primary hover:border-brand-blue-light"
            >
              Found on {ACCESS_TAB_LABELS[t]}
              <ArrowRight className="w-4 h-4" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
