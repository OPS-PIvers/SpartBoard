// Body seed for a new meeting note. Headings stay `## ` so NotesMarkdown renders them as sections.
export function buildMeetingNoteTemplate(labels: {
  agenda: string;
  discussionNotes: string;
}): string {
  return [
    `## ${labels.agenda}`,
    '- ',
    '',
    `## ${labels.discussionNotes}`,
    '- ',
    '',
  ].join('\n');
}
