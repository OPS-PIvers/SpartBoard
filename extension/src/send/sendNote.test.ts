import { describe, expect, it } from 'vitest';
import { sendNote } from './sendNote';

describe('sendNote', () => {
  it('says what was sent', () => {
    expect(
      sendNote({ kind: 'reply', reply: { ok: true, blocks: 3, images: 1 } })
    ).toEqual({
      ok: true,
      open: 'import',
      text: 'Sent this page to SpartBoard.',
    });
    expect(
      sendNote({
        kind: 'reply',
        reply: { ok: true, blocks: 1, images: 0 },
        selectionOnly: true,
      }).text
    ).toBe('Sent your selection to SpartBoard.');
  });

  it('says when a reader fell back to the page text', () => {
    expect(
      sendNote({
        kind: 'reply',
        reply: { ok: true, blocks: 1, images: 0 },
        fellBack: true,
      }).text
    ).toMatch(/quiz reader couldn't read this page/);
  });

  it("prefers the server's own refusal and names a block", () => {
    expect(
      sendNote({
        kind: 'reply',
        reply: { ok: false, why: 'no-access', message: 'Too many sends.' },
      })
    ).toEqual({ ok: false, text: 'Too many sends.' });
    expect(sendNote({ kind: 'blocked' }).ok).toBe(false);
    expect(sendNote({ kind: 'empty', selectionOnly: true }).text).toMatch(
      /box you type in/
    );
    expect(sendNote({ kind: 'reply', reply: undefined }).ok).toBe(false);
  });
});
