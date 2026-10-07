import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import { DEFAULT_GOAL_COACH_RUBRIC } from '@/config/goalCoachRubric';
import { PLC_GROUP_TYPES } from '@/types';
import { normalizeTeamTypeDefaults } from '@/utils/teamLayout';
import {
  CARD_ROWS,
  builtInDraft,
  draftFromPreset,
  isDefaultRubric,
  presetFromDraft,
  presetToFirestore,
  rubricDraftFrom,
  rubricFromDraft,
} from './teamTypeDefaultsModel';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

describe('team type preset drafts', () => {
  it.each(PLC_GROUP_TYPES)(
    'round-trips the built-in %s preset unchanged',
    (type) => {
      expect(presetFromDraft(builtInDraft(type), type)).toEqual(
        BUILT_IN_TEAM_TYPE_PRESETS[type]
      );
    }
  );

  it.each(PLC_GROUP_TYPES)(
    'card rows for %s stay inside the landing catalog',
    (type) => {
      const draft = builtInDraft(type);
      const all = draft.cards.map((c) => ({ ...c, on: true }));
      const preset = presetFromDraft({ ...draft, cards: all }, type);
      for (const r of CARD_ROWS[type]) {
        for (const id of r.ids) expect(preset.cards).toContain(id);
      }
    }
  );

  it('writes a combined row as both of its cards, in row order', () => {
    const draft = builtInDraft('plc');
    const strip = draft.cards.filter((c) => c.ids.length === 2);
    expect(strip.map((c) => c.label)).toEqual(['Next meeting and open items']);
    const cards = [...strip, ...draft.cards.filter((c) => c.ids.length !== 2)];
    const preset = presetFromDraft({ ...draft, cards }, 'plc');
    expect(preset.cards.slice(0, 3)).toEqual([
      'hero',
      'nextMeeting',
      'openItems',
    ]);
  });

  it('keeps the landing page on and drops off cards', () => {
    const draft = builtInDraft('building');
    const preset = presetFromDraft(
      {
        ...draft,
        pages: draft.pages.map((p) => ({ ...p, enabled: false })),
        cards: draft.cards.map((c) => ({ ...c, on: false })),
      },
      'building'
    );
    expect(preset.pages.find((p) => p.id === 'hub')?.enabled).toBe(true);
    expect(preset.cards).toEqual(['hero']);
  });

  it('saves an emptied template as none and reads it back that way', () => {
    const draft = { ...builtInDraft('plc'), template: [] };
    const stored = presetToFirestore(presetFromDraft(draft, 'plc'));
    expect(stored.meetingNoteTemplate).toBe('');
    const back = normalizeTeamTypeDefaults({ types: { plc: stored } });
    expect(back.types.plc).toBeDefined();
    expect(back.types.plc?.meetingNoteTemplate).toBeUndefined();
    const plc = back.types.plc ?? BUILT_IN_TEAM_TYPE_PRESETS.building;
    expect(draftFromPreset(plc, 'plc').template).toEqual([]);
  });

  it('trims and dedupes resource categories', () => {
    const draft = {
      ...builtInDraft('building'),
      categories: [' Forms ', 'Forms', '', 'Safety'],
    };
    expect(presetFromDraft(draft, 'building').resourceCategories).toEqual([
      'Forms',
      'Safety',
    ]);
  });

  it('never writes undefined to Firestore', () => {
    const stored = presetToFirestore(BUILT_IN_TEAM_TYPE_PRESETS.building);
    expect(Object.values(stored)).not.toContain(undefined);
  });
});

describe('goal coach rubric drafts', () => {
  it('leaves the default rubric as the default', () => {
    const out = rubricFromDraft(rubricDraftFrom(undefined));
    expect(isDefaultRubric(out)).toBe(true);
  });

  it('gives new criteria a server-valid id and a description', () => {
    const out = rubricFromDraft([
      ...rubricDraftFrom(undefined),
      { label: '  Uses   common assessment data!  ' },
      { label: 'Uses common assessment data' },
      { label: '   ' },
      { label: '!!!' },
    ]);
    const added = out.slice(DEFAULT_GOAL_COACH_RUBRIC.length);
    expect(added.map((c) => c.id)).toEqual([
      'uses-common-assessment-data',
      'criterion-7',
      'criterion-8',
    ]);
    for (const c of out) {
      expect(c.id).toMatch(ID_RE);
      expect(c.description.trim()).not.toBe('');
    }
  });

  it('replaces the description when a label is rewritten', () => {
    const rows = rubricDraftFrom(undefined);
    rows[0] = { ...rows[0], label: 'Names the students it is for' };
    const out = rubricFromDraft(rows);
    expect(out[0]).toEqual({
      id: 'student-focused',
      label: 'Names the students it is for',
      description: 'Names the students it is for',
    });
    expect(out[1].description).toBe(DEFAULT_GOAL_COACH_RUBRIC[1].description);
  });

  it('caps the rubric at the server maximum', () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({
      label: `Criterion ${i}`,
    }));
    expect(rubricFromDraft(rows)).toHaveLength(10);
  });
});
