import type { PlcActionItem, PlcMember } from '@/types';
import { escapeHtml } from '@/utils/printHtmlDocument';
import { markdownToEditorHtml } from '@/components/plc/bodies/notesRichText';
import { splitNoteSections } from '@/utils/noteSections';
import { groupBlocksBySection, type NoteDocBlock } from './noteBlocksRead';

export interface NoteGoogleDocLabels {
  actionItems: string;
  due: (date: string) => string;
  /** Heading of a Decision block; only needed when `blocks` has one. */
  decision?: string;
}

export interface NoteGoogleDocInput {
  title: string;
  subtitle: string;
  body: string;
  actionItems: PlcActionItem[];
  members: PlcMember[];
  labels: NoteGoogleDocLabels;
  blocks?: NoteDocBlock[];
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

function blocksHtml(blocks: NoteDocBlock[], decisionLabel: string): string {
  const agenda = blocks
    .filter((b) => b.kind === 'agenda')
    .map(
      (b) =>
        `<li>${escapeHtml(b.text)}${b.who ? ` (${escapeHtml(b.who)})` : ''}</li>`
    )
    .join('');
  const rest = blocks
    .map((b) => {
      if (b.kind === 'data') return `<p><b>${escapeHtml(b.title)}</b></p>`;
      if (b.kind !== 'decision') return '';
      const head = [decisionLabel, ...b.meta].filter(Boolean).join(' · ');
      return `<p><b>${escapeHtml(head)}</b></p><p>${escapeHtml(b.text).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
  return (agenda ? `<ul>${agenda}</ul>` : '') + rest;
}

// Each section's blocks follow its text, as the note shows them.
function bodyWithBlocksHtml(
  markdown: string,
  blocks: NoteDocBlock[],
  decisionLabel: string
): string {
  if (!blocks.length) return bodyHtml(markdown);
  const groups = groupBlocksBySection(markdown, blocks);
  const placed = new Set<string | null>();
  return splitNoteSections(markdown)
    .map((section) => {
      const md =
        section.heading === null
          ? section.content
          : `## ${section.heading}\n\n${section.content}`;
      const first = !placed.has(section.heading);
      placed.add(section.heading);
      const own = first
        ? (groups.find((g) => g.heading === section.heading)?.blocks ?? [])
        : [];
      return (md.trim() ? bodyHtml(md) : '') + blocksHtml(own, decisionLabel);
    })
    .join('');
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
  const blocks = input.blocks ?? [];
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
    bodyWithBlocksHtml(
      items ? dropTrailingHeading(body, labels.actionItems) : body,
      blocks,
      labels.decision ?? ''
    ),
    items ? `<h2>${escapeHtml(labels.actionItems)}</h2><ul>${items}</ul>` : '',
    '</body></html>',
  ].join('');
}
