import { describe, expect, it } from 'vitest';
import {
  joinNoteSections,
  noteHeadings,
  replaceSectionContent,
  splitNoteSections,
} from './noteSections';

describe('noteSections', () => {
  it('splits at ## headings and keeps text before the first one', () => {
    const sections = splitNoteSections(
      'Intro\n\n## Agenda\n- a\n\n## Decisions\n'
    );
    expect(sections).toEqual([
      { heading: null, content: 'Intro' },
      { heading: 'Agenda', content: '- a' },
      { heading: 'Decisions', content: '' },
    ]);
  });

  it('ignores headings inside code fences', () => {
    const body = '## A\n```\n## not a heading\n```\n## B\n';
    expect(noteHeadings(body)).toEqual(['A', 'B']);
  });

  it('round-trips a body through split and join', () => {
    const body = '## Agenda\n\n- one\n\n## Action items\n\n';
    expect(noteHeadings(joinNoteSections(splitNoteSections(body)))).toEqual([
      'Agenda',
      'Action items',
    ]);
  });

  it('replaces one section and leaves the others alone', () => {
    const body = '## A\nold\n\n## B\nkeep\n';
    const next = replaceSectionContent(body, 1, 'new');
    expect(splitNoteSections(next)[1].content).toBe('new');
    expect(splitNoteSections(next)[2].content).toBe('keep');
    expect(replaceSectionContent(body, 9, 'x')).toBe(body);
  });
});
