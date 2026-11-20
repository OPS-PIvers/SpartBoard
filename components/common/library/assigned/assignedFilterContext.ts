import { createContext } from 'react';

/** The class label picked in the Assigned tab's Class filter; rows describe that class. */
export const AssignedFocusClassContext = createContext<string | null>(null);
