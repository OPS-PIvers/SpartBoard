import { describe, it, expect } from 'vitest';
import type { Plc, PlcGroupType, PlcTeamLayout } from '@/types';
import {
  BUILT_IN_TEAM_TYPE_PRESETS,
  TEAM_LANDING_CARD_CATALOG,
  teamTypeAvailablePages,
} from '@/config/teamTypePresets';
import {
  normalizeTeamTypeDefaults,
  parseTeamHero,
  parseTeamHeroRef,
  parseTeamLayout,
  resolveTeamLayout,
  sanitizeTeamLayout,
  sanitizeTeamTypePreset,
  toStoredTeamLayout,
} from './teamLayout';

const makePlc = (over: Partial<Plc> = {}): Plc => ({
  id: 'p1',
  name: 'Team',
  members: {},
  leadUid: 'lead',
  memberUids: ['lead'],
  memberEmails: {},
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const enabledIds = (pages: { id: string; enabled: boolean }[]) =>
  pages.filter((p) => p.enabled).map((p) => p.id);

describe('built-in presets', () => {
  it('match the page sets at a glance', () => {
    expect(enabledIds(BUILT_IN_TEAM_TYPE_PRESETS.plc.pages)).toEqual([
      'dataOverview',
      'assessments',
      'docs',
      'resources',
    ]);
    expect(enabledIds(BUILT_IN_TEAM_TYPE_PRESETS.department.pages)).toEqual([
      'hub',
      'docs',
      'resources',
    ]);
    expect(enabledIds(BUILT_IN_TEAM_TYPE_PRESETS.building.pages)).toEqual([
      'hub',
      'resources',
      'updates',
    ]);
    expect(enabledIds(BUILT_IN_TEAM_TYPE_PRESETS.mentoring.pages)).toEqual([
      'programHub',
      'workspace',
      'updates',
      'resources',
    ]);
  });

  it('keep off-by-default pages listed but disabled', () => {
    const off = (t: PlcGroupType) =>
      BUILT_IN_TEAM_TYPE_PRESETS[t].pages
        .filter((p) => !p.enabled)
        .map((p) => p.id);
    expect(off('plc')).toEqual(['updates']);
    expect(off('department')).toEqual(['updates']);
    expect(off('building')).toEqual(['docs']);
    expect(off('mentoring')).toEqual([]);
  });

  it('put goals on for PLC only (T21) and never as a page', () => {
    expect(BUILT_IN_TEAM_TYPE_PRESETS.plc.cards).toContain('goals');
    for (const t of ['department', 'building', 'mentoring'] as const) {
      expect(BUILT_IN_TEAM_TYPE_PRESETS[t].cards).not.toContain('goals');
    }
  });

  it('use the T6 hero default rules', () => {
    expect(BUILT_IN_TEAM_TYPE_PRESETS.plc.heroRule).toBe('latestAssessment');
    expect(BUILT_IN_TEAM_TYPE_PRESETS.building.heroRule).toBe(
      'newestPinnedUpdate'
    );
    expect(BUILT_IN_TEAM_TYPE_PRESETS.department.heroRule).toBe(
      'nextMeetingNote'
    );
    expect(BUILT_IN_TEAM_TYPE_PRESETS.mentoring.heroRule).toBe(
      'nextRequiredTask'
    );
  });

  it('give building no meeting template by default (T12, T25)', () => {
    expect(BUILT_IN_TEAM_TYPE_PRESETS.building.meetingNoteTemplate).toBe(
      undefined
    );
    expect(BUILT_IN_TEAM_TYPE_PRESETS.plc.meetingNoteTemplate).toContain(
      'learn'
    );
  });

  it('are already sanitized and cards fit each landing catalog', () => {
    for (const t of Object.keys(BUILT_IN_TEAM_TYPE_PRESETS) as PlcGroupType[]) {
      const preset = BUILT_IN_TEAM_TYPE_PRESETS[t];
      const catalog = TEAM_LANDING_CARD_CATALOG[preset.landing] ?? [];
      expect(preset.cards.every((c) => catalog.includes(c))).toBe(true);
      expect(
        sanitizeTeamLayout({ ...preset, hero: { mode: 'default' } }, t)
      ).toEqual({
        pages: preset.pages,
        landing: preset.landing,
        cards: preset.cards,
        hero: { mode: 'default' },
      });
    }
  });
});

describe('parseTeamHeroRef / parseTeamHero', () => {
  it('accepts each ref kind with its id', () => {
    expect(parseTeamHeroRef({ kind: 'assessment', assessmentId: 'a' })).toEqual(
      { kind: 'assessment', assessmentId: 'a' }
    );
    expect(parseTeamHeroRef({ kind: 'target', targetId: 't' })).toEqual({
      kind: 'target',
      targetId: 't',
    });
    expect(parseTeamHeroRef({ kind: 'goal', goalId: 'g' })).toEqual({
      kind: 'goal',
      goalId: 'g',
    });
    expect(parseTeamHeroRef({ kind: 'doc', docId: 'd' })).toEqual({
      kind: 'doc',
      docId: 'd',
    });
    expect(parseTeamHeroRef({ kind: 'note', noteId: 'n' })).toEqual({
      kind: 'note',
      noteId: 'n',
    });
    expect(parseTeamHeroRef({ kind: 'update', updateId: 'u' })).toEqual({
      kind: 'update',
      updateId: 'u',
    });
    expect(parseTeamHeroRef({ kind: 'calendar', extra: 1 })).toEqual({
      kind: 'calendar',
    });
  });

  it('rejects unknown kinds, missing ids and non-objects', () => {
    expect(parseTeamHeroRef({ kind: 'board', boardId: 'b' })).toBeUndefined();
    expect(parseTeamHeroRef({ kind: 'goal' })).toBeUndefined();
    expect(parseTeamHeroRef({ kind: 'doc', docId: '  ' })).toBeUndefined();
    expect(parseTeamHeroRef('goal')).toBeUndefined();
    expect(parseTeamHeroRef(null)).toBeUndefined();
  });

  it('falls back to default when a pin has no valid ref', () => {
    expect(parseTeamHero({ mode: 'pinned' })).toEqual({ mode: 'default' });
    expect(parseTeamHero({ mode: 'pinned', ref: { kind: 'x' } })).toEqual({
      mode: 'default',
    });
    expect(parseTeamHero({ mode: 'sticky' })).toEqual({ mode: 'default' });
    expect(
      parseTeamHero({ mode: 'default', ref: { kind: 'calendar' } })
    ).toEqual({ mode: 'default' });
    expect(
      parseTeamHero({ mode: 'pinned', ref: { kind: 'goal', goalId: 'g' } })
    ).toEqual({ mode: 'pinned', ref: { kind: 'goal', goalId: 'g' } });
  });

  it('keeps a well-formed pinnedBy and drops a malformed one', () => {
    const ref = { kind: 'goal', goalId: 'g' };
    expect(
      parseTeamHero({
        mode: 'pinned',
        ref,
        pinnedBy: { uid: 'u1', name: 'Priya Shah', extra: 1 },
      })
    ).toEqual({
      mode: 'pinned',
      ref,
      pinnedBy: { uid: 'u1', name: 'Priya Shah' },
    });
    expect(
      parseTeamHero({ mode: 'pinned', ref, pinnedBy: { name: 'Priya Shah' } })
    ).toEqual({ mode: 'pinned', ref });
    expect(
      parseTeamHero({ mode: 'default', pinnedBy: { uid: 'u1', name: 'P' } })
    ).toEqual({ mode: 'default' });
  });
});

describe('parseTeamLayout', () => {
  it('returns undefined for non-layouts', () => {
    expect(parseTeamLayout(undefined)).toBeUndefined();
    expect(parseTeamLayout('hub')).toBeUndefined();
    expect(parseTeamLayout({ landing: 'hub' })).toBeUndefined();
    expect(parseTeamLayout({ pages: [], landing: 'home' })).toBeUndefined();
  });

  it('drops unknown and duplicate ids and coerces enabled', () => {
    expect(
      parseTeamLayout({
        pages: [
          { id: 'hub', enabled: true },
          { id: 'boards', enabled: true },
          { id: 'hub', enabled: false },
          { id: 'docs', enabled: 'yes' },
          'resources',
        ],
        landing: 'hub',
        cards: ['hero', 'hero', 'chart', 3, 'quickLinks'],
        hero: { mode: 'pinned', ref: { kind: 'calendar' } },
      })
    ).toEqual({
      pages: [
        { id: 'hub', enabled: true },
        { id: 'docs', enabled: false },
      ],
      landing: 'hub',
      cards: ['hero', 'quickLinks'],
      hero: { mode: 'pinned', ref: { kind: 'calendar' } },
    });
  });

  it('treats missing cards and hero as empty and default', () => {
    expect(parseTeamLayout({ pages: [], landing: 'hub' })).toEqual({
      pages: [],
      landing: 'hub',
      cards: [],
      hero: { mode: 'default' },
    });
  });
});

describe('sanitizeTeamLayout', () => {
  const base: PlcTeamLayout = {
    pages: [],
    landing: 'dataOverview',
    cards: [],
    hero: { mode: 'default' },
  };

  it('drops pages the type cannot use and appends missing ones disabled', () => {
    const out = sanitizeTeamLayout(
      {
        ...base,
        pages: [
          { id: 'resources', enabled: true },
          { id: 'workspace', enabled: true },
          { id: 'dataOverview', enabled: true },
        ],
      },
      'plc'
    );
    expect(out.pages).toEqual([
      { id: 'resources', enabled: true },
      { id: 'dataOverview', enabled: true },
      { id: 'assessments', enabled: false },
      { id: 'docs', enabled: false },
      { id: 'updates', enabled: false },
    ]);
    expect(out.pages.map((p) => p.id).sort()).toEqual(
      teamTypeAvailablePages('plc').sort()
    );
  });

  it('keeps the landing page enabled', () => {
    const out = sanitizeTeamLayout(
      { ...base, pages: [{ id: 'dataOverview', enabled: false }] },
      'plc'
    );
    expect(out.pages.find((p) => p.id === 'dataOverview')?.enabled).toBe(true);
  });

  it('falls back when the landing is not a landing page or not the type', () => {
    expect(
      sanitizeTeamLayout({ ...base, landing: 'docs' }, 'plc').landing
    ).toBe('dataOverview');
    expect(
      sanitizeTeamLayout({ ...base, landing: 'programHub' }, 'department')
        .landing
    ).toBe('hub');
    expect(
      sanitizeTeamLayout({ ...base, landing: 'hub' }, 'mentoring').landing
    ).toBe('programHub');
  });

  it('uses the given fallback landing before the built-in one', () => {
    expect(
      sanitizeTeamLayout({ ...base, landing: 'docs' }, 'department', {
        landing: 'hub',
      }).landing
    ).toBe('hub');
  });

  it('filters cards to the landing catalog and dedupes', () => {
    const out = sanitizeTeamLayout(
      {
        ...base,
        landing: 'hub',
        cards: ['hero', 'distribution', 'quickLinks', 'quickLinks', 'nextTask'],
      },
      'building'
    );
    expect(out.cards).toEqual(['hero', 'quickLinks']);
  });

  it('drops a pinned hero without a valid ref', () => {
    const out = sanitizeTeamLayout(
      {
        ...base,
        hero: { mode: 'pinned', ref: { kind: 'goal', goalId: '' } },
      },
      'plc'
    );
    expect(out.hero).toEqual({ mode: 'default' });
  });
});

describe('sanitizeTeamTypePreset / normalizeTeamTypeDefaults', () => {
  it('returns the built-in preset for junk', () => {
    expect(sanitizeTeamTypePreset(null, 'plc')).toBe(
      BUILT_IN_TEAM_TYPE_PRESETS.plc
    );
  });

  it('keeps valid parts and replaces invalid ones with the built-in', () => {
    const out = sanitizeTeamTypePreset(
      {
        pages: 'nope',
        landing: 'docs',
        cards: ['hero', 'trend', 'bogus'],
        heroRule: 'random',
        meetingNoteTemplate: '## Our agenda',
        resourceCategories: [' Forms ', 'Forms', '', 4, 'Handbook'],
      },
      'plc'
    );
    expect(out.pages).toEqual(BUILT_IN_TEAM_TYPE_PRESETS.plc.pages);
    expect(out.landing).toBe('dataOverview');
    expect(out.cards).toEqual(['hero', 'trend']);
    expect(out.heroRule).toBe('latestAssessment');
    expect(out.meetingNoteTemplate).toBe('## Our agenda');
    expect(out.resourceCategories).toEqual(['Forms', 'Handbook']);
  });

  it('lets an admin clear a template with an empty string', () => {
    const out = sanitizeTeamTypePreset({ meetingNoteTemplate: '' }, 'plc');
    expect(out.meetingNoteTemplate).toBeUndefined();
  });

  it('keeps the built-in template when the admin never set one', () => {
    const out = sanitizeTeamTypePreset({ heroRule: 'nextMeetingNote' }, 'plc');
    expect(out.meetingNoteTemplate).toBe(
      BUILT_IN_TEAM_TYPE_PRESETS.plc.meetingNoteTemplate
    );
    expect(out.heroRule).toBe('nextMeetingNote');
  });

  it.each(['teamGoal', 'lowestTarget', 'newestDoc', 'calendar'] as const)(
    'keeps the %s hero rule through save, read and resolve',
    (heroRule) => {
      expect(sanitizeTeamTypePreset({ heroRule }, 'plc').heroRule).toBe(
        heroRule
      );
      const defaults = normalizeTeamTypeDefaults({
        types: { plc: { heroRule } },
      });
      expect(defaults.types.plc?.heroRule).toBe(heroRule);
      expect(resolveTeamLayout(makePlc(), defaults).heroRule).toBe(heroRule);
    }
  );

  it('keeps an empty card list the admin chose', () => {
    expect(sanitizeTeamTypePreset({ cards: [] }, 'plc').cards).toEqual([]);
  });

  it('normalizes the whole doc, skipping unsaved types and bad rubric rows', () => {
    const out = normalizeTeamTypeDefaults({
      types: {
        building: { heroRule: 'nextMeetingNote' },
        bogus: { heroRule: 'latestAssessment' },
        mentoring: 'x',
      },
      goalCoachRubric: [
        { id: 'a', label: 'A', description: 'one' },
        { id: 'a', label: 'dup', description: '' },
        { id: 'b', label: 'B' },
        { id: '', label: 'C', description: '' },
      ],
    });
    expect(Object.keys(out.types)).toEqual(['building']);
    expect(out.types.building?.heroRule).toBe('nextMeetingNote');
    expect(out.goalCoachRubric).toEqual([
      { id: 'a', label: 'A', description: 'one' },
      { id: 'b', label: 'B', description: '' },
    ]);
  });

  it('returns empty defaults for a missing or junk doc', () => {
    expect(normalizeTeamTypeDefaults(undefined)).toEqual({ types: {} });
    expect(
      normalizeTeamTypeDefaults({ types: 'x', goalCoachRubric: 3 })
    ).toEqual({ types: {} });
  });
});

describe('resolveTeamLayout', () => {
  it('uses the built-in preset for a team with no layout or admin defaults', () => {
    const out = resolveTeamLayout(makePlc({ groupType: 'building' }));
    expect(out.source).toBe('preset');
    expect(out.landing).toBe('hub');
    expect(out.heroRule).toBe('newestPinnedUpdate');
    expect(out.pages).toEqual(BUILT_IN_TEAM_TYPE_PRESETS.building.pages);
    expect(out.hero).toEqual({ mode: 'default' });
  });

  it('reads a legacy team with no groupType as a PLC', () => {
    expect(resolveTeamLayout(makePlc()).landing).toBe('dataOverview');
  });

  it('prefers the admin default for the type over the built-in', () => {
    const admin = normalizeTeamTypeDefaults({
      types: {
        department: {
          pages: [
            { id: 'hub', enabled: true },
            { id: 'updates', enabled: true },
          ],
          landing: 'hub',
          cards: ['hero', 'goals'],
          heroRule: 'newestPinnedUpdate',
        },
      },
    });
    const out = resolveTeamLayout(makePlc({ groupType: 'department' }), admin);
    expect(out.source).toBe('admin');
    expect(enabledIds(out.pages)).toEqual(['hub', 'updates']);
    expect(out.cards).toEqual(['hero', 'goals']);
    expect(out.heroRule).toBe('newestPinnedUpdate');
    expect(resolveTeamLayout(makePlc(), admin).source).toBe('preset');
  });

  it('prefers the team layout over admin defaults, keeping the admin hero rule', () => {
    const admin = normalizeTeamTypeDefaults({
      types: { plc: { heroRule: 'nextMeetingNote' } },
    });
    const layout: PlcTeamLayout = {
      pages: [
        { id: 'docs', enabled: true },
        { id: 'dataOverview', enabled: true },
      ],
      landing: 'dataOverview',
      cards: ['trend'],
      hero: { mode: 'pinned', ref: { kind: 'assessment', assessmentId: 'a' } },
    };
    const out = resolveTeamLayout(makePlc({ layout }), admin);
    expect(out.source).toBe('team');
    expect(out.pages[0]).toEqual({ id: 'docs', enabled: true });
    expect(out.cards).toEqual(['trend']);
    expect(out.hero.mode).toBe('pinned');
    expect(out.heroRule).toBe('nextMeetingNote');
  });

  it('T35: keeps Notes & Docs off when the legacy notes switch is off', () => {
    const out = resolveTeamLayout(makePlc({ features: { notes: false } }));
    expect(out.pages.find((p) => p.id === 'docs')?.enabled).toBe(false);
    expect(out.pages.find((p) => p.id === 'assessments')?.enabled).toBe(true);
  });

  it('T35: turns Assessments off only when quizzes and videos are both off', () => {
    const one = resolveTeamLayout(makePlc({ features: { quizzes: false } }));
    expect(one.pages.find((p) => p.id === 'assessments')?.enabled).toBe(true);
    const both = resolveTeamLayout(
      makePlc({ features: { quizzes: false, videoActivities: false } })
    );
    expect(both.pages.find((p) => p.id === 'assessments')?.enabled).toBe(false);
  });

  it('T35: ignores the shared boards switch (boards fold into Resources)', () => {
    const out = resolveTeamLayout(
      makePlc({ features: { sharedBoards: false } })
    );
    expect(out.pages.find((p) => p.id === 'resources')?.enabled).toBe(true);
  });

  it('T35: leaves a team without a features map on the full preset', () => {
    const out = resolveTeamLayout(makePlc({ groupType: 'department' }));
    expect(enabledIds(out.pages)).toEqual(['hub', 'docs', 'resources']);
  });

  it('T35: does not override a layout the lead saved', () => {
    const layout: PlcTeamLayout = {
      pages: [
        { id: 'dataOverview', enabled: true },
        { id: 'docs', enabled: true },
      ],
      landing: 'dataOverview',
      cards: [],
      hero: { mode: 'default' },
    };
    const out = resolveTeamLayout(
      makePlc({ layout, features: { notes: false } })
    );
    expect(out.pages.find((p) => p.id === 'docs')?.enabled).toBe(true);
  });

  it('sanitizes a stored team layout against its type', () => {
    const layout: PlcTeamLayout = {
      pages: [
        { id: 'workspace', enabled: true },
        { id: 'hub', enabled: false },
      ],
      landing: 'dataOverview',
      cards: ['submissionStatus', 'recentDocs'],
      hero: { mode: 'default' },
    };
    const out = resolveTeamLayout(makePlc({ groupType: 'department', layout }));
    expect(out.landing).toBe('hub');
    expect(out.pages.find((p) => p.id === 'hub')?.enabled).toBe(true);
    expect(out.pages.some((p) => p.id === 'workspace')).toBe(false);
    expect(out.cards).toEqual(['recentDocs']);
  });
});

describe('toStoredTeamLayout', () => {
  it('keeps who pinned the hero', () => {
    const resolved = resolveTeamLayout(makePlc());
    const stored = toStoredTeamLayout({
      ...resolved,
      hero: {
        mode: 'pinned',
        ref: { kind: 'goal', goalId: 'g' },
        pinnedBy: { uid: 'u1', name: 'Priya Shah' },
      },
    });
    expect(stored.hero.pinnedBy).toEqual({ uid: 'u1', name: 'Priya Shah' });
  });

  it('strips resolver fields and an unpinned ref', () => {
    const resolved = resolveTeamLayout(makePlc());
    const stored = toStoredTeamLayout({
      ...resolved,
      hero: { mode: 'default', ref: { kind: 'calendar' } },
    });
    expect(Object.keys(stored).sort()).toEqual([
      'cards',
      'hero',
      'landing',
      'pages',
    ]);
    expect(stored.hero).toEqual({ mode: 'default' });
  });

  it('keeps a pinned ref', () => {
    const stored = toStoredTeamLayout({
      pages: [{ id: 'hub', enabled: true }],
      landing: 'hub',
      cards: ['hero'],
      hero: { mode: 'pinned', ref: { kind: 'update', updateId: 'u1' } },
    });
    expect(stored.hero).toEqual({
      mode: 'pinned',
      ref: { kind: 'update', updateId: 'u1' },
    });
  });
});
