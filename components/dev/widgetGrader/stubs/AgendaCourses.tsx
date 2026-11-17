import React from 'react';
import { AgendaFixtureContext } from '@/components/widgets/Agenda/fixtureCourses';
import { AGENDA_FIXTURE_COURSES } from '../fixtures/agenda';
import { FIXTURE_NAMES, type FixtureName } from '../fixtures/types';

// A stand-in for a teacher's first slide, since the harness can't reach Google.
const DECK_PAGE = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 8vw;box-sizing:border-box;background:#fff;font-family:Lexend,sans-serif;color:#1e293b"><h1 style="font-size:7vw;margin:0 0 3vw">Monday, Nov 16</h1><ul style="font-size:4vw;line-height:1.6;margin:0"><li>Warm-up: journal prompt</li><li>Read chapter 4 with a partner</li><li>Exit ticket</li></ul></body></html>`;

// No Course listener in the harness, so the widget gets the fixture's Courses by name.
function fixtureName(): FixtureName {
  const name = new URLSearchParams(window.location.search).get('fixture');
  return FIXTURE_NAMES.find((n) => n === name) ?? 'typical';
}

export const AgendaCourses: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <AgendaFixtureContext.Provider
    value={{
      courses: AGENDA_FIXTURE_COURSES[fixtureName()],
      deckSrcDoc: DECK_PAGE,
    }}
  >
    {children}
  </AgendaFixtureContext.Provider>
);
