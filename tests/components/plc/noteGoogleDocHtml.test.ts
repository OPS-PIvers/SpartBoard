import { describe, it, expect } from 'vitest';
import { buildNoteGoogleDocHtml } from '@/components/plc/notes/noteGoogleDocHtml';
import type { PlcMember } from '@/types';

const members = [
  { uid: 'u1', email: 'jess@x.org', displayName: 'Jess', role: 'member' },
] as PlcMember[];
const labels = {
  actionItems: 'Action items',
  due: (date: string) => `due ${date}`,
};

describe('buildNoteGoogleDocHtml', () => {
  it('writes the title, formatted body and action items with owner and due date', () => {
    const html = buildNoteGoogleDocHtml({
      title: 'Week 6 <meeting>',
      subtitle: 'Grade 6 Math',
      body: '## Agenda\n- **Review** results\n- [x] Norms\n\n## Action items\n',
      actionItems: [
        {
          id: 'a1',
          text: 'Build exit ticket',
          done: false,
          assigneeUid: 'u1',
          dueAt: new Date(2026, 9, 8).getTime(),
          createdBy: 'u1',
          createdAt: 0,
        },
      ],
      members,
      labels,
    });
    expect(html).toContain('<h1>Week 6 &lt;meeting&gt;</h1>');
    expect(html).toContain('<h2>Agenda</h2>');
    expect(html).toContain('<strong>Review</strong>');
    expect(html).toContain('<li>☑ Norms</li>');
    expect(html.match(/Action items/g)).toHaveLength(1);
    expect(html).toMatch(/<li>☐ Build exit ticket \(Jess, due [^)]+\)<\/li>/);
  });

  it('keeps an Action items heading when there are no action items', () => {
    const html = buildNoteGoogleDocHtml({
      title: 'Notes',
      subtitle: '',
      body: '## Action items\n',
      actionItems: [],
      members,
      labels,
    });
    expect(html).toContain('<h2>Action items</h2>');
    expect(html).not.toContain('<ul>');
  });
});
