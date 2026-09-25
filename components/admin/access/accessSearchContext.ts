import { createContext, useContext, useState } from 'react';
import type { AccessTabId } from './accessSearch';

export interface AccessSearchValue {
  query: string;
  setQuery: (query: string) => void;
  goToTab?: (tab: AccessTabId) => void;
}

export const AccessSearchContext = createContext<AccessSearchValue | null>(
  null
);

/** Falls back to local state when a tab renders outside Admin Settings. */
export const useAccessSearch = (): AccessSearchValue => {
  const shared = useContext(AccessSearchContext);
  const [query, setQuery] = useState('');
  return shared ?? { query, setQuery };
};
