// Landing card registry (T2, T18, T24, T26, T34): slices register a card with one line each.

import type { TeamCardRegistry } from './types';

/** Landing cards; `Component: null` renders the neutral placeholder. */
export const TEAM_CARD_REGISTRY: TeamCardRegistry = {
  hero: { Component: null, span: 'full' },
  goals: { Component: null, span: 'third' },
  nextMeeting: { Component: null, span: 'third' },
  openItems: { Component: null, span: 'third' },
  recentAssessments: { Component: null, span: 'twoThirds' },
  distribution: { Component: null, span: 'third' },
  trend: { Component: null, span: 'third' },
  participation: { Component: null, span: 'third' },
  masteryByTarget: { Component: null, span: 'full' },
  quickLinks: { Component: null, span: 'third' },
  latestUpdates: { Component: null, span: 'twoThirds' },
  resourcesByCategory: { Component: null, span: 'twoThirds' },
  calendar: { Component: null, span: 'third' },
  nextTask: { Component: null, span: 'full' },
  submissionStatus: { Component: null, span: 'half' },
  recentDocs: { Component: null, span: 'half' },
  newMaterials: { Component: null, span: 'half' },
  openDecisions: { Component: null, span: 'full' },
};
