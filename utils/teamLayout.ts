/** Team layout parsing and resolution (docs/plans/TEAMS_REDESIGN.md T1–T3, T6, T35). */

import {
  getPlcFeatures,
  getPlcGroupType,
  type GoalCoachCriterion,
  type Plc,
  type PlcGroupType,
  type PlcTeamLayout,
  type TeamCardId,
  type TeamHero,
  type TeamHeroRef,
  type TeamHeroRule,
  type TeamPageId,
  type TeamPageSetting,
  type TeamTypeDefaults,
  type TeamTypePreset,
  PLC_GROUP_TYPES,
} from '@/types';
import {
  BUILT_IN_TEAM_TYPE_PRESETS,
  TEAM_LANDING_CARD_CATALOG,
  isTeamCardId,
  isTeamHeroRule,
  isTeamLandingPage,
  isTeamPageId,
  teamTypeAvailablePages,
} from '@/config/teamTypePresets';

export type TeamLayoutSource = 'team' | 'admin' | 'preset';

export interface ResolvedTeamLayout extends PlcTeamLayout {
  /** Fills the hero while `hero.mode` is 'default' (T6). */
  heroRule: TeamHeroRule;
  source: TeamLayoutSource;
}

const MAX_TEMPLATE_CHARS = 20000;
const MAX_CATEGORIES = 30;
const MAX_CATEGORY_CHARS = 60;
const MAX_RUBRIC_CRITERIA = 12;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const nonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

export function parseTeamHeroRef(raw: unknown): TeamHeroRef | undefined {
  if (!isRecord(raw)) return undefined;
  switch (raw.kind) {
    case 'assessment':
      return nonEmptyString(raw.assessmentId)
        ? { kind: 'assessment', assessmentId: raw.assessmentId }
        : undefined;
    case 'target':
      return nonEmptyString(raw.targetId)
        ? { kind: 'target', targetId: raw.targetId }
        : undefined;
    case 'goal':
      return nonEmptyString(raw.goalId)
        ? { kind: 'goal', goalId: raw.goalId }
        : undefined;
    case 'doc':
      return nonEmptyString(raw.docId)
        ? { kind: 'doc', docId: raw.docId }
        : undefined;
    case 'note':
      return nonEmptyString(raw.noteId)
        ? { kind: 'note', noteId: raw.noteId }
        : undefined;
    case 'update':
      return nonEmptyString(raw.updateId)
        ? { kind: 'update', updateId: raw.updateId }
        : undefined;
    case 'calendar':
      return { kind: 'calendar' };
    default:
      return undefined;
  }
}

/** A pinned hero needs a valid ref; anything else follows the type's default rule. */
function parsePinnedBy(raw: unknown): TeamHero['pinnedBy'] {
  if (!isRecord(raw) || !nonEmptyString(raw.uid)) return undefined;
  return { uid: raw.uid, name: typeof raw.name === 'string' ? raw.name : '' };
}

export function parseTeamHero(raw: unknown): TeamHero {
  if (isRecord(raw) && raw.mode === 'pinned') {
    const ref = parseTeamHeroRef(raw.ref);
    const pinnedBy = parsePinnedBy(raw.pinnedBy);
    if (ref)
      return pinnedBy
        ? { mode: 'pinned', ref, pinnedBy }
        : { mode: 'pinned', ref };
  }
  return { mode: 'default' };
}

function parsePages(raw: unknown): TeamPageSetting[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<TeamPageId>();
  const out: TeamPageSetting[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !isTeamPageId(entry.id) || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    out.push({ id: entry.id, enabled: entry.enabled === true });
  }
  return out;
}

function parseCards(raw: unknown): TeamCardId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isTeamCardId))];
}

/** Structural parse of a stored `plcs/{id}.layout`; undefined when it is not a layout at all. */
export function parseTeamLayout(raw: unknown): PlcTeamLayout | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.pages)) return undefined;
  if (!isTeamPageId(raw.landing)) return undefined;
  return {
    pages: parsePages(raw.pages),
    landing: raw.landing,
    cards: parseCards(raw.cards),
    hero: parseTeamHero(raw.hero),
  };
}

/** Fits a layout to its group type: known pages only, every page listed, landing valid and on, cards from the landing's catalog. */
export function sanitizeTeamLayout(
  layout: PlcTeamLayout,
  groupType: PlcGroupType,
  fallback: Pick<TeamTypePreset, 'landing'> = BUILT_IN_TEAM_TYPE_PRESETS[
    groupType
  ]
): PlcTeamLayout {
  const available = teamTypeAvailablePages(groupType);
  const pages = parsePages(layout.pages).filter((p) =>
    available.includes(p.id)
  );
  for (const id of available) {
    if (!pages.some((p) => p.id === id)) pages.push({ id, enabled: false });
  }

  const landingOk = (id: TeamPageId) =>
    available.includes(id) && isTeamLandingPage(id);
  const landing: TeamPageId = landingOk(layout.landing)
    ? layout.landing
    : landingOk(fallback.landing)
      ? fallback.landing
      : BUILT_IN_TEAM_TYPE_PRESETS[groupType].landing;
  const withLanding = pages.map((p) =>
    p.id === landing ? { ...p, enabled: true } : p
  );

  const catalog = TEAM_LANDING_CARD_CATALOG[landing] ?? [];
  const cards = parseCards(layout.cards).filter((c) => catalog.includes(c));

  return {
    pages: withLanding,
    landing,
    cards,
    hero: parseTeamHero(layout.hero),
  };
}

/** One admin preset, with each invalid part replaced by the built-in one. */
export function sanitizeTeamTypePreset(
  raw: unknown,
  groupType: PlcGroupType
): TeamTypePreset {
  const builtIn = BUILT_IN_TEAM_TYPE_PRESETS[groupType];
  if (!isRecord(raw)) return builtIn;
  const parsedPages = parsePages(raw.pages);
  const layout = sanitizeTeamLayout(
    {
      pages: parsedPages.length ? parsedPages : builtIn.pages,
      landing: isTeamPageId(raw.landing) ? raw.landing : builtIn.landing,
      cards: Array.isArray(raw.cards) ? parseCards(raw.cards) : builtIn.cards,
      hero: { mode: 'default' },
    },
    groupType
  );
  const preset: TeamTypePreset = {
    pages: layout.pages,
    landing: layout.landing,
    cards: layout.cards,
    heroRule: isTeamHeroRule(raw.heroRule) ? raw.heroRule : builtIn.heroRule,
  };
  if (typeof raw.meetingNoteTemplate === 'string') {
    if (raw.meetingNoteTemplate.trim()) {
      preset.meetingNoteTemplate = raw.meetingNoteTemplate.slice(
        0,
        MAX_TEMPLATE_CHARS
      );
    }
  } else if (builtIn.meetingNoteTemplate !== undefined) {
    preset.meetingNoteTemplate = builtIn.meetingNoteTemplate;
  }
  if (Array.isArray(raw.resourceCategories)) {
    const cats = [
      ...new Set(
        raw.resourceCategories
          .filter(nonEmptyString)
          .map((c) => c.trim().slice(0, MAX_CATEGORY_CHARS))
      ),
    ].slice(0, MAX_CATEGORIES);
    if (cats.length) preset.resourceCategories = cats;
  }
  return preset;
}

function parseRubric(raw: unknown): GoalCoachCriterion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: GoalCoachCriterion[] = [];
  for (const c of raw) {
    if (!isRecord(c) || !nonEmptyString(c.id) || !nonEmptyString(c.label)) {
      continue;
    }
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({
      id: c.id,
      label: c.label,
      description: typeof c.description === 'string' ? c.description : '',
    });
  }
  return out.length ? out.slice(0, MAX_RUBRIC_CRITERIA) : undefined;
}

/** Parses `admin_settings/team_type_defaults`; types the admin never saved are left out. */
export function normalizeTeamTypeDefaults(raw: unknown): TeamTypeDefaults {
  const out: TeamTypeDefaults = { types: {} };
  if (!isRecord(raw)) return out;
  const types = isRecord(raw.types) ? raw.types : {};
  for (const groupType of PLC_GROUP_TYPES) {
    if (isRecord(types[groupType])) {
      out.types[groupType] = sanitizeTeamTypePreset(
        types[groupType],
        groupType
      );
    }
  }
  const rubric = parseRubric(raw.goalCoachRubric);
  if (rubric) out.goalCoachRubric = rubric;
  return out;
}

/** T35: a page whose legacy section switch is off stays off until the lead saves a layout. */
function applyLegacySwitches(
  pages: TeamPageSetting[],
  plc: Plc,
  landing: TeamPageId
): TeamPageSetting[] {
  if (!plc.features) return pages;
  const features = getPlcFeatures(plc);
  const off = new Set<TeamPageId>();
  if (!features.notes) off.add('docs');
  if (!features.quizzes && !features.videoActivities) off.add('assessments');
  off.delete(landing);
  return pages.map((p) => (off.has(p.id) ? { ...p, enabled: false } : p));
}

/** Effective layout: the team's own, else the admin default for its type, else the built-in preset. */
export function resolveTeamLayout(
  plc: Plc,
  adminDefaults?: TeamTypeDefaults | null
): ResolvedTeamLayout {
  const groupType = getPlcGroupType(plc);
  const preset =
    adminDefaults?.types[groupType] ?? BUILT_IN_TEAM_TYPE_PRESETS[groupType];
  const heroRule = preset.heroRule;

  if (plc.layout) {
    const layout = sanitizeTeamLayout(plc.layout, groupType, preset);
    return { ...layout, heroRule, source: 'team' };
  }

  const base = sanitizeTeamLayout(
    {
      pages: preset.pages,
      landing: preset.landing,
      cards: preset.cards,
      hero: { mode: 'default' },
    },
    groupType
  );
  return {
    ...base,
    pages: applyLegacySwitches(base.pages, plc, base.landing),
    heroRule,
    source: adminDefaults?.types[groupType] ? 'admin' : 'preset',
  };
}

/** The layout a lead saves; strips the resolver's extra fields. */
export function toStoredTeamLayout(layout: PlcTeamLayout): PlcTeamLayout {
  const hero: TeamHero =
    layout.hero.mode === 'pinned' && layout.hero.ref
      ? layout.hero.pinnedBy
        ? {
            mode: 'pinned',
            ref: layout.hero.ref,
            pinnedBy: layout.hero.pinnedBy,
          }
        : { mode: 'pinned', ref: layout.hero.ref }
      : { mode: 'default' };
  return {
    pages: layout.pages.map((p) => ({ id: p.id, enabled: p.enabled })),
    landing: layout.landing,
    cards: [...layout.cards],
    hero,
  };
}
