import { describe, expect, it } from 'vitest';
import {
  parseMeetingNoteTemplate,
  serializeMeetingNoteTemplate,
} from './meetingNoteTemplate';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';

describe('meeting-note template markdown', () => {
  it('reads headings, block markers and bodies', () => {
    const parsed = parseMeetingNoteTemplate(
      'Intro\n\n## Data\n<!-- block:data -->\n\n## Notes\nSome text\n'
    );
    expect(parsed.preamble).toBe('Intro');
    expect(parsed.sections).toEqual([
      { heading: 'Data', kind: 'data', body: '' },
      { heading: 'Notes', kind: 'text', body: 'Some text' },
    ]);
  });

  it('treats an unknown or late marker as body text', () => {
    const parsed = parseMeetingNoteTemplate(
      '## A\n<!-- block:chart -->\n## B\nx\n<!-- block:data -->'
    );
    expect(parsed.sections[0]).toMatchObject({ kind: 'text' });
    expect(parsed.sections[1]).toMatchObject({ kind: 'text' });
    expect(parsed.sections[1].body).toContain('block:data');
  });

  it('round-trips and drops blank headings', () => {
    const md = serializeMeetingNoteTemplate({
      preamble: '',
      sections: [
        { heading: ' Agenda ', kind: 'text', body: '' },
        { heading: '  ', kind: 'data', body: '' },
        { heading: 'Next steps', kind: 'actionItems', body: '- [ ] ' },
      ],
    });
    expect(md).toBe(
      '## Agenda\n\n## Next steps\n<!-- block:actionItems -->\n- [ ]\n'
    );
    expect(parseMeetingNoteTemplate(md).sections.map((s) => s.kind)).toEqual([
      'text',
      'actionItems',
    ]);
  });

  it('gives empty markdown when no section is left', () => {
    expect(serializeMeetingNoteTemplate({ preamble: '', sections: [] })).toBe(
      ''
    );
  });

  it('parses the built-in PLC template into the four questions and action items', () => {
    const { sections } = parseMeetingNoteTemplate(
      BUILT_IN_TEAM_TYPE_PRESETS.plc.meetingNoteTemplate
    );
    expect(sections.map((s) => s.kind)).toEqual([
      'text',
      'data',
      'decision',
      'text',
      'actionItems',
    ]);
  });
});
