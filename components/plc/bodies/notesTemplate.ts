/**
 * The body seed for a new structured meeting note (Decision 2.5b). Lives next
 * to (but separate from) the markdown renderer so its component-only export
 * keeps react-refresh happy. The headings here MUST stay `## ` so the
 * `NotesMarkdown` renderer promotes them to section headings — and the
 * action-items list seeds a `- [ ] ` checklist item so the agenda → decisions →
 * action-items shape is immediately legible in preview.
 *
 * Section labels are passed in (i18n) so the template localizes.
 */
export function buildMeetingNoteTemplate(labels: {
  agenda: string;
  decisions: string;
  actionItems: string;
}): string {
  return [
    `## ${labels.agenda}`,
    '- ',
    '',
    `## ${labels.decisions}`,
    '- ',
    '',
    `## ${labels.actionItems}`,
    '- [ ] ',
    '',
  ].join('\n');
}
