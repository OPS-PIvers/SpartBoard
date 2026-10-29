import { createContext } from 'react';

/** Student names by uid for the widget grader harness, which has no ClassLink lookup; null everywhere else. */
export const FocusFixtureNamesContext = createContext<Record<
  string,
  string
> | null>(null);
