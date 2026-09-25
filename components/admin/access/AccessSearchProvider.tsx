import React, { useState } from 'react';
import { AccessSearchContext } from './accessSearchContext';
import type { AccessTabId } from './accessSearch';

/** Shares one search query across the Access tabs so a tab switch keeps it. */
export const AccessSearchProvider: React.FC<{
  goToTab: (tab: AccessTabId) => void;
  children: React.ReactNode;
}> = ({ goToTab, children }) => {
  const [query, setQuery] = useState('');
  return (
    <AccessSearchContext.Provider value={{ query, setQuery, goToTab }}>
      {children}
    </AccessSearchContext.Provider>
  );
};
