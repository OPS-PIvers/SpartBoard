import { describe, expect, it } from 'vitest';
import type { TeamTypeDefaults } from '@/types';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import { parseMeetingNoteTemplate } from './meetingNoteTemplate';
import {
  actionItemsSectionOf,
  buildMeetingNoteFromTemplate,
  resolveMeetingNoteTemplate,
} from './meetingNoteBuild';
import { noteHeadings } from './noteSections';

const ctx = { uid: 'u1', now: 100, latestAssessmentId: 'a1' };

describe('resolveMeetingNoteTemplate', () => {
  const admin = {
    types: { department: { meetingNoteTemplate: '## Admin agenda\n' } },
  } as unknown as TeamTypeDefaults;

  it('prefers the team template, then the admin default, then the preset', () => {
    expect(
      resolveMeetingNoteTemplate(
        { groupType: 'department', meetingNoteTemplate: '## Ours\n' },
        admin
      )
    ).toEqual({ markdown: '## Ours\n', source: 'team' });
    expect(
      resolveMeetingNoteTemplate({ groupType: 'department' }, admin)
    ).toEqual({
      markdown: '## Admin agenda\n',
      source: 'admin',
    });
    expect(resolveMeetingNoteTemplate({ groupType: 'plc' }, admin)).toEqual({
      markdown: BUILT_IN_TEAM_TYPE_PRESETS.plc.meetingNoteTemplate,
      source: 'preset',
    });
  });

  it('treats an empty team template as no template', () => {
    expect(
      resolveMeetingNoteTemplate(
        { groupType: 'plc', meetingNoteTemplate: ' ' },
        null
      )
    ).toEqual({ markdown: null, source: 'none' });
  });
});

describe('buildMeetingNoteFromTemplate', () => {
  it('writes each heading and seeds Data and Decision blocks under it', () => {
    const parsed = parseMeetingNoteTemplate(
      BUILT_IN_TEAM_TYPE_PRESETS.plc.meetingNoteTemplate
    );
    const draft = buildMeetingNoteFromTemplate(parsed, ctx);
    const headings = noteHeadings(draft.body);
    expect(headings).toEqual(parsed.sections.map((s) => s.heading));
    expect(draft.body).not.toContain('<!--');
    const data = draft.blocks.find((b) => b.kind === 'data');
    const decision = draft.blocks.find((b) => b.kind === 'decision');
    expect(data).toMatchObject({ assessmentId: 'a1', createdBy: 'u1' });
    expect(decision).toMatchObject({ status: 'open', text: '' });
    for (const b of draft.blocks) expect(headings).toContain(b.section);
  });

  it('keeps template text under its heading', () => {
    const draft = buildMeetingNoteFromTemplate(
      parseMeetingNoteTemplate('## Check-in\nHow did the week go?\n'),
      ctx
    );
    expect(draft.body).toBe('## Check-in\n\nHow did the week go?\n');
    expect(draft.blocks).toEqual([]);
  });

  it('builds an empty note from no template', () => {
    expect(
      buildMeetingNoteFromTemplate(parseMeetingNoteTemplate(''), ctx)
    ).toEqual({
      body: '',
      blocks: [],
    });
  });
});

describe('actionItemsSectionOf', () => {
  it('uses the template marker, else a heading named like action items', () => {
    const { sections } = parseMeetingNoteTemplate(
      '## Wrap-up\n<!-- block:actionItems -->\n'
    );
    expect(actionItemsSectionOf(sections, ['Wrap-up'])).toBe('Wrap-up');
    expect(actionItemsSectionOf([], ['Agenda', 'Next steps'])).toBe(
      'Next steps'
    );
    expect(actionItemsSectionOf([], ['Agenda'])).toBeNull();
  });
});
