import { describe, expect, it } from 'vitest';
import type { PlcNote, PlcTeamLayout } from '@/types';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import {
  AGGREGATES,
  ASSESSMENTS,
} from '@/components/plc/redesignMockup/fixtures';
import { resolveTeamRoute, teamPageSection } from './teamSections';
import { packLandingRows } from './landing/landingRows';
import { TEAM_CARD_REGISTRY } from './cardRegistry';
import { selectNewerHeroData } from './heroes/heroStaleness';
import {
  TEAM_HERO_BY_KIND,
  TEAM_HERO_BY_RULE,
  resolveTeamHeroEntry,
  teamHeroRuleKind,
} from './heroes/heroRegistry';
import { heroPinner } from './heroes/heroPin';
import { parseTeamHero, toStoredTeamLayout } from '@/utils/teamLayout';
import {
  cardBlocked,
  cardRows,
  draftFromLayout,
  layoutFromDraft,
} from './shell/layoutDraft';
import { selectMyItems } from './shell/myItems';
import { districtDefaultLayout, layoutForNewTeam } from './teamRollout';

const plcLayout: PlcTeamLayout = {
  pages: BUILT_IN_TEAM_TYPE_PRESETS.plc.pages,
  landing: 'dataOverview',
  cards: BUILT_IN_TEAM_TYPE_PRESETS.plc.cards,
  hero: { mode: 'default' },
};

describe('resolveTeamRoute', () => {
  it('opens the landing page at home and folds boards into resources', () => {
    expect(resolveTeamRoute('home', plcLayout)).toEqual({
      route: { kind: 'page', page: 'dataOverview' },
      canonical: 'home',
    });
    expect(resolveTeamRoute('sharedBoards', plcLayout).canonical).toBe(
      'resources'
    );
  });

  it('sends a page that is off, or a retired page, to the landing page', () => {
    expect(resolveTeamRoute('updates', plcLayout).canonical).toBe('home');
    expect(resolveTeamRoute('targets', plcLayout).canonical).toBe('home');
  });

  it('keeps gear-menu sections off the rail', () => {
    expect(resolveTeamRoute('members', plcLayout).route).toEqual({
      kind: 'section',
      section: 'members',
    });
  });

  it('maps landing pages to the bare team path', () => {
    expect(teamPageSection('hub')).toBe('home');
    expect(teamPageSection('docs')).toBe('docs');
  });
});

describe('packLandingRows', () => {
  it('gives the hero its own row and packs thirds three to a row', () => {
    const rows = packLandingRows(
      ['distribution', 'trend', 'participation', 'goals'],
      TEAM_CARD_REGISTRY
    );
    expect(rows).toEqual([
      ['hero'],
      ['distribution', 'trend', 'participation'],
      ['goals'],
    ]);
  });
});

describe('hero', () => {
  it('flags newer results than the pinned assessment', () => {
    expect(
      selectNewerHeroData(
        { kind: 'assessment', assessmentId: 'u3' },
        AGGREGATES,
        ASSESSMENTS
      )?.assessmentId
    ).toBe('u4');
    expect(
      selectNewerHeroData(
        { kind: 'assessment', assessmentId: 'u4' },
        AGGREGATES,
        ASSESSMENTS
      )
    ).toBeNull();
    expect(selectNewerHeroData(null, AGGREGATES, ASSESSMENTS)).toBeNull();
  });

  it('gives each new rule its kind and dispatches to that kind', () => {
    expect(teamHeroRuleKind('teamGoal')).toBe('goal');
    expect(teamHeroRuleKind('lowestTarget')).toBe('target');
    expect(teamHeroRuleKind('newestDoc')).toBe('doc');
    expect(teamHeroRuleKind('calendar')).toBe('calendar');
    expect(teamHeroRuleKind('latestAssessment')).toBeNull();
    expect(resolveTeamHeroEntry(null, 'teamGoal', 'plc')).toBe(
      TEAM_HERO_BY_KIND.goal
    );
    expect(resolveTeamHeroEntry(null, 'lowestTarget', 'plc')).toBe(
      TEAM_HERO_BY_KIND.target
    );
    expect(resolveTeamHeroEntry(null, 'newestDoc', 'department')).toBeNull();
    expect(
      resolveTeamHeroEntry(null, 'somethingNew' as 'latestAssessment', 'plc')
    ).toBe(TEAM_HERO_BY_RULE.latestAssessment);
  });

  it('returns no renderer for an unregistered rule or kind', () => {
    expect(resolveTeamHeroEntry(null, 'calendar', 'building')).toBeNull();
    expect(
      resolveTeamHeroEntry(
        { kind: 'update', updateId: 'x' },
        'latestAssessment',
        'plc'
      )
    ).toBeNull();
  });
});

describe('layout draft', () => {
  it('lists enabled rows first and joins next meeting with open items', () => {
    const rows = cardRows('plc', 'dataOverview', ['hero', 'trend']);
    expect(rows[0]).toMatchObject({ ids: ['trend'], on: true });
    expect(rows.filter((r) => r.on)).toHaveLength(1);
    expect(rows.some((r) => r.ids.includes('hero'))).toBe(false);
    expect(rows.some((r) => r.ids.includes('quickLinks'))).toBe(false);
    expect(rows.find((r) => r.ids.includes('openItems'))?.ids).toEqual([
      'nextMeeting',
      'openItems',
    ]);
  });

  it('switches both cards of a combined row and keeps uncovered cards', () => {
    const draft = draftFromLayout(
      {
        ...plcLayout,
        cards: ['hero', 'nextMeeting', 'openItems', 'quickLinks'],
      },
      'plc'
    );
    const out = layoutFromDraft(
      {
        ...draft,
        cards: draft.cards.map((c) =>
          c.ids.includes('nextMeeting') ? { ...c, on: false } : c
        ),
      },
      new Map()
    );
    expect(out.cards).toEqual(['hero', 'quickLinks']);
  });

  it('round-trips a layout and drops a card blocked by Updates', () => {
    const draft = draftFromLayout(
      { ...plcLayout, cards: ['hero', 'latestUpdates', 'goals'] },
      'plc'
    );
    expect(cardBlocked(['latestUpdates'], draft.pages)).toBe(true);
    const out = layoutFromDraft(draft, new Map());
    expect(out.cards).toEqual(['hero', 'goals']);
    expect(out.hero).toEqual({ mode: 'default' });
  });

  it('keeps a pinned item that is in the picker', () => {
    const ref = { kind: 'goal' as const, goalId: 'g1' };
    const draft = {
      ...draftFromLayout(plcLayout, 'plc'),
      heroMode: 'pinned' as const,
      heroKey: 'goal:g1',
    };
    expect(layoutFromDraft(draft, new Map([['goal:g1', ref]])).hero).toEqual({
      mode: 'pinned',
      ref,
    });
  });
});

describe('hero pinnedBy', () => {
  const ref = { kind: 'goal' as const, goalId: 'g1' };
  const priya = { uid: 'u-priya', name: 'Priya Shah' };
  const sam = { uid: 'u-sam', name: 'Sam Lee' };
  const pinnedDraft = {
    ...draftFromLayout(plcLayout, 'plc'),
    heroMode: 'pinned' as const,
    heroKey: 'goal:g1',
  };
  const refs = new Map([['goal:g1', ref]]);

  it('writes the pinning lead and clears it on Follow default', () => {
    const pinned = layoutFromDraft(pinnedDraft, refs, priya);
    expect(pinned.hero).toEqual({ mode: 'pinned', ref, pinnedBy: priya });
    const followed = layoutFromDraft(
      { ...draftFromLayout(pinned, 'plc'), heroMode: 'default' },
      refs,
      sam,
      pinned.hero
    );
    expect(followed.hero).toEqual({ mode: 'default' });
  });

  it('keeps the first pinner when the same item stays pinned', () => {
    const previous = { mode: 'pinned' as const, ref, pinnedBy: priya };
    expect(layoutFromDraft(pinnedDraft, refs, sam, previous).hero).toEqual(
      previous
    );
    const other = {
      mode: 'pinned' as const,
      ref: { kind: 'goal' as const, goalId: 'g2' },
      pinnedBy: priya,
    };
    expect(
      layoutFromDraft(pinnedDraft, refs, sam, other).hero.pinnedBy
    ).toEqual(sam);
  });

  it('survives parse and store, and drops a malformed value', () => {
    const hero = { mode: 'pinned', ref, pinnedBy: priya };
    expect(parseTeamHero(hero)).toEqual(hero);
    expect(
      parseTeamHero({ mode: 'pinned', ref, pinnedBy: { name: 'x' } })
    ).toEqual({ mode: 'pinned', ref });
    expect(parseTeamHero({ mode: 'default', pinnedBy: priya })).toEqual({
      mode: 'default',
    });
    expect(
      toStoredTeamLayout({
        ...plcLayout,
        hero: { mode: 'pinned', ref, pinnedBy: priya },
      }).hero
    ).toEqual(hero);
  });

  it('names the pinner from the signed-in user', () => {
    expect(
      heroPinner({ uid: 'u1', displayName: null, email: 'a@b.org' })
    ).toEqual({ uid: 'u1', name: 'a@b.org' });
    expect(heroPinner(null)).toBeUndefined();
  });
});

describe('selectMyItems', () => {
  const note = (actionItems: PlcNote['actionItems']): PlcNote => ({
    id: 'n1',
    title: 'PLC meeting Oct 2',
    body: '',
    actionItems,
    createdBy: 'a',
    createdAt: 0,
    lastEditedBy: 'a',
    lastEditedAt: 0,
  });
  const now = Date.UTC(2026, 9, 7);

  it('splits my open items from ones I finished lately', () => {
    const items = selectMyItems(
      [
        note([
          {
            id: '1',
            text: 'Open',
            done: false,
            assigneeUid: 'me',
            createdBy: 'a',
            createdAt: 1,
          },
          {
            id: '2',
            text: 'Recent',
            done: true,
            doneAt: now - 1000,
            assigneeUid: 'me',
            createdBy: 'a',
            createdAt: 1,
          },
          {
            id: '3',
            text: 'Old',
            done: true,
            doneAt: now - 30 * 86400000,
            assigneeUid: 'me',
            createdBy: 'a',
            createdAt: 1,
          },
          {
            id: '4',
            text: 'Theirs',
            done: false,
            assigneeUid: 'you',
            createdBy: 'a',
            createdAt: 1,
          },
        ]),
      ],
      'me',
      now
    );
    expect(items.open.map((v) => v.item.id)).toEqual(['1']);
    expect(items.done.map((v) => v.item.id)).toEqual(['2']);
  });
});

describe('layoutForNewTeam', () => {
  it('omits the layout when the admin defaults read fails', async () => {
    const failing = () => Promise.reject(new Error('unavailable'));
    expect(await layoutForNewTeam('plc', failing)).toBeUndefined();
  });

  it('freezes the built-in preset when no admin defaults exist', async () => {
    const out = await layoutForNewTeam('plc', () => Promise.resolve(null));
    expect(out).toEqual(districtDefaultLayout({ groupType: 'plc' }, null));
  });
});

describe('districtDefaultLayout', () => {
  it('ignores the team layout and old section switches', () => {
    const out = districtDefaultLayout({ groupType: 'department' }, null);
    expect(out.landing).toBe('hub');
    expect(out.hero).toEqual({ mode: 'default' });
  });
});
