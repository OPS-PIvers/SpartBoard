import { describe, expect, it } from 'vitest';
import {
  editorDomToMarkdown,
  markdownToEditorHtml,
} from '@/components/plc/bodies/notesRichText';
import { tokenizeInline } from '@/components/plc/bodies/notesMarkdownGrammar';

function roundTrip(md: string): string {
  const el = document.createElement('div');
  el.innerHTML = markdownToEditorHtml(md);
  return editorDomToMarkdown(el);
}

function fromHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return editorDomToMarkdown(el);
}

describe('notes rich text bridge', () => {
  it('round-trips the meeting template exactly', () => {
    const md = '## Agenda\n- \n\n## Decisions\n- \n\n## Action items\n- [ ] \n';
    expect(roundTrip(md)).toBe(md);
  });

  it('keeps one line per paragraph so plain notes keep their line breaks', () => {
    const md =
      'Once a week on Wednesdays\nUse tech communication tool to send\nUse guided learning to create';
    expect(roundTrip(md)).toBe(md);
  });

  it('round-trips headings, lists, checklists, quotes and inline marks', () => {
    const md = [
      '# Big',
      '### Small',
      '- one **bold** and *italic*',
      '- [x] done `code`',
      '- [ ] open',
      '1. first',
      '2. second',
      '> quoted',
      '',
      'plain **_both_** end',
    ].join('\n');
    expect(roundTrip(md)).toBe(md);
  });

  it('renders the editor blocks for a checklist and heading', () => {
    expect(markdownToEditorHtml('## A\n- [x] b')).toBe(
      '<h2>A</h2><ul><li data-checked="true">b</li></ul>'
    );
  });

  it('escapes HTML in note text', () => {
    expect(markdownToEditorHtml('<img src=x onerror=alert(1)>')).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt;</p>'
    );
  });

  it('serializes browser formatting tags', () => {
    expect(
      fromHtml('<p><b>Bold</b> and <i>it</i></p><div>next<br>line</div>')
    ).toBe('**Bold** and *it*\nnext\nline');
  });

  it('escapes typed Markdown characters so they stay literal', () => {
    const md = fromHtml(
      '<p>a * b * c and file_name_here</p><p># not a heading</p>'
    );
    const lines = md.split('\n');
    const plain = (line: string) =>
      tokenizeInline(line)
        .map((t) => (t.type === 'text' ? t.value : '?'))
        .join('');
    expect(plain(lines[0])).toBe('a * b * c and file_name_here');
    expect(lines[1]).toBe('\\# not a heading');
    expect(roundTrip(md)).toBe(md);
  });

  it('keeps list-looking paragraph text as a paragraph', () => {
    const md = fromHtml('<p>- dash</p><p>1. one</p><ul><li>[ ] box</li></ul>');
    expect(md).toBe('\\- dash\n1\\. one\n- \\[ ] box');
    const el = document.createElement('div');
    el.innerHTML = markdownToEditorHtml(md);
    expect(el.querySelectorAll('p')).toHaveLength(2);
    expect(el.querySelector('li')?.dataset.checked).toBeUndefined();
  });

  it('moves edge whitespace outside bold markers', () => {
    expect(fromHtml('<p>a<b> bold </b>b</p>')).toBe('a **bold** b');
  });

  it('maps an empty editor to an empty note', () => {
    expect(fromHtml('<p><br></p>')).toBe('');
    expect(fromHtml('')).toBe('');
  });
});
