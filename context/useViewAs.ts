import { useContext } from 'react';
import { ViewAsContext, ViewAsContextValue } from './ViewAsContextValue';

/** The View as session in a view-as tab, or null everywhere else. */
export const useViewAs = (): ViewAsContextValue | null =>
  useContext(ViewAsContext);
