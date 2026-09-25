import React from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { useAccessSearch } from './accessSearchContext';
import {
  ACCESS_TAB_LABELS,
  countAccessMatches,
  type AccessTabId,
} from './accessSearch';

export const AdminSearchField: React.FC<{
  tab: AccessTabId;
  placeholder: string;
}> = ({ tab, placeholder }) => {
  const { query, setQuery } = useAccessSearch();
  return (
    <div className="sticky top-0 z-10 -mx-1 px-1 pb-2 bg-slate-50">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          data-testid={`access-search-${tab}`}
          className="w-full pl-9 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

/** Empty-result state that links to the other Access tabs that do match. */
export const AccessSearchEmpty: React.FC<{
  tab: AccessTabId;
  fallback: string;
}> = ({ tab, fallback }) => {
  const { query, goToTab } = useAccessSearch();
  const counts = countAccessMatches(query);
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
