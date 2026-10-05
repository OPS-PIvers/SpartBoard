import type { PlcActionItem, PlcMember } from '@/types';
import { escapeHtml } from '@/utils/printHtmlDocument';
import { markdownToEditorHtml } from '@/components/plc/bodies/notesRichText';

export interface NoteGoogleDocLabels {
  actionItems: string;
  due: (date: string) => string;
}

export interface NoteGoogleDocInput {
  title: string;
  subtitle: string;
  body: string;
  actionItems: PlcActionItem[];
  members: PlcMember[];
  labels: NoteGoogleDocLabels;
}

const box = (checked: boolean) => (checked ? '☑ ' : '☐ ');

// Docs import ignores data attributes, so checklist state becomes a box glyph.
function bodyHtml(markdown: string): string {
  return markdownToEditorHtml(markdown)
    .replace(/<p><br><\/p>/g, '')
    .replace(
      /<li data-checked="(true|false)">/g,
      (_m, checked: string) => `<li>${box(checked === 'true')}`
    );
}

// The meeting template ends on an empty "Action items" heading; the list below replaces it.
function dropTrailingHeading(markdown: string, heading: string): string {
  const lines = markdown.trimEnd().split('\n');
  const last = lines[lines.length - 1]?.trim() ?? '';
  return /^#{1,3}\s+/.test(last) && last.replace(/^#{1,3}\s+/, '') === heading
    ? lines.slice(0, -1).join('\n')
    : markdown;
}

function formatDue(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function buildNoteGoogleDocHtml(input: NoteGoogleDocInput): string {
  const { title, subtitle, body, actionItems, members, labels } = input;
  const nameFor = (uid: string | null | undefined) =>
    uid ? (members.find((m) => m.uid === uid)?.displayName ?? '') : '';
  const items = actionItems
    .map((item) => {
      const extras = [
        nameFor(item.assigneeUid),
        item.dueAt ? labels.due(formatDue(item.dueAt)) : '',
      ].filter(Boolean);
      const tail = extras.length ? ` (${escapeHtml(extras.join(', '))})` : '';
      return `<li>${box(item.done)}${escapeHtml(item.text)}${tail}</li>`;
    })
    .join('');
  return [
    '<html><head><meta charset="utf-8"></head><body>',
    `<h1>${escapeHtml(title)}</h1>`,
    subtitle ? `<p>${escapeHtml(subtitle)}</p>` : '',
    bodyHtml(items ? dropTrailingHeading(body, labels.actionItems) : body),
    items ? `<h2>${escapeHtml(labels.actionItems)}</h2><ul>${items}</ul>` : '',
    '</body></html>',
  ].join('');
}
