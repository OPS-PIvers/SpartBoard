// Splits a note body at its `## ` headings so each section edits on its own and blocks sit under their heading.

export interface NoteSection {
  /** null for text before the first heading. */
  heading: string | null;
  /** Markdown between this heading and the next, without the heading line. */
  content: string;
}

const HEADING_RE = /^##\s+(.+?)\s*$/;

export function splitNoteSections(body: string): NoteSection[] {
  const sections: NoteSection[] = [{ heading: null, content: '' }];
  const buffers: string[][] = [[]];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = inFence ? null : HEADING_RE.exec(line);
    if (m) {
      sections.push({ heading: m[1], content: '' });
      buffers.push([]);
    } else {
      buffers[buffers.length - 1].push(line);
    }
  }
  return sections.map((s, i) => ({
    ...s,
    content: trimBlankEdges(buffers[i].join('\n')),
  }));
}

function trimBlankEdges(text: string): string {
  return text.replace(/^\s*\n/, '').replace(/\n\s*$/, '');
}

export function joinNoteSections(sections: readonly NoteSection[]): string {
  const parts: string[] = [];
  for (const s of sections) {
    if (s.heading === null) {
      if (s.content.trim()) parts.push(s.content, '');
      continue;
    }
    parts.push(`## ${s.heading}`);
    parts.push(s.content.trim() ? s.content : '');
    parts.push('');
  }
  return parts.join('\n').replace(/\n+$/, '\n');
}

/** Replace one section's content and rebuild the body. */
export function replaceSectionContent(
  body: string,
  index: number,
  content: string
): string {
  const sections = splitNoteSections(body);
  if (!sections[index]) return body;
  sections[index] = { ...sections[index], content };
  return joinNoteSections(sections);
}

export function noteHeadings(body: string): string[] {
  return splitNoteSections(body)
    .map((s) => s.heading)
    .filter((h): h is string => h !== null);
}
