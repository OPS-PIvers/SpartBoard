/** Meeting-note template sections stored as markdown with a block marker under each heading (TEAMS_REDESIGN T12, T13). */

export type MeetingNoteBlockKind = 'text' | 'data' | 'decision' | 'actionItems';

export const MEETING_NOTE_BLOCK_KINDS: readonly MeetingNoteBlockKind[] = [
  'text',
  'data',
  'decision',
  'actionItems',
];

export interface MeetingNoteTemplateSection {
  heading: string;
  kind: MeetingNoteBlockKind;
  /** Markdown under the heading, kept as written. */
  body: string;
}

export interface ParsedMeetingNoteTemplate {
  /** Markdown before the first heading. */
  preamble: string;
  sections: MeetingNoteTemplateSection[];
}

const HEADING_RE = /^##\s+(.*\S)\s*$/;
const MARKER_RE = /^<!--\s*block:([a-zA-Z]+)\s*-->\s*$/;

const isKind = (v: string): v is MeetingNoteBlockKind =>
  (MEETING_NOTE_BLOCK_KINDS as readonly string[]).includes(v);

const trimBlank = (lines: string[]): string =>
  lines.join('\n').replace(/^\n+|\s+$/g, '');

export function parseMeetingNoteTemplate(
  markdown: string | undefined
): ParsedMeetingNoteTemplate {
  const lines = (markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const preamble: string[] = [];
  const sections: {
    heading: string;
    kind: MeetingNoteBlockKind;
    body: string[];
  }[] = [];
  for (const line of lines) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      sections.push({ heading: heading[1], kind: 'text', body: [] });
      continue;
    }
    const current = sections[sections.length - 1];
    if (!current) {
      preamble.push(line);
      continue;
    }
    const marker = MARKER_RE.exec(line);
    if (marker && current.body.every((l) => !l.trim()) && isKind(marker[1])) {
      current.kind = marker[1];
      continue;
    }
    current.body.push(line);
  }
  return {
    preamble: trimBlank(preamble),
    sections: sections.map((s) => ({
      heading: s.heading,
      kind: s.kind,
      body: trimBlank(s.body),
    })),
  };
}

/** Sections with a blank heading are dropped; no sections and no preamble gives ''. */
export function serializeMeetingNoteTemplate(
  template: ParsedMeetingNoteTemplate
): string {
  const parts: string[] = [];
  if (template.preamble.trim()) parts.push(template.preamble.trim());
  for (const s of template.sections) {
    const heading = s.heading.replace(/\s+/g, ' ').trim();
    if (!heading) continue;
    const lines = [`## ${heading}`];
    if (s.kind !== 'text') lines.push(`<!-- block:${s.kind} -->`);
    if (s.body.trim()) lines.push(s.body.trim());
    parts.push(lines.join('\n'));
  }
  return parts.length ? `${parts.join('\n\n')}\n` : '';
}
