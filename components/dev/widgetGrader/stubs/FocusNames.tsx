import React from 'react';
import { FocusFixtureNamesContext } from '@/components/widgets/Focus/fixtureNames';
import { FOCUS_FIXTURE_NAMES } from '../fixtures/focus';

// The harness can't reach the ClassLink name lookup, so the seeded roster's names come from the fixture.
export const FocusNames: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <FocusFixtureNamesContext.Provider value={FOCUS_FIXTURE_NAMES}>
    {children}
  </FocusFixtureNamesContext.Provider>
);
