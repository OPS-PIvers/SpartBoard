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

  it('says when a lesson went, and refuses a video stored on Edpuzzle', () => {
    const reply = { ok: true, blocks: 3, images: 0 };
    expect(
      sendNote({ kind: 'reply', reply, lesson: { skipped: 0 } }).text
    ).toBe('Sent this lesson to SpartBoard.');
    expect(
      sendNote({ kind: 'reply', reply, lesson: { skipped: 2 } }).text
    ).toMatch(/2 questions SpartBoard has no kind for were left out/);
    expect(
      sendNote({ kind: 'reply', reply, fellBack: 'edpuzzle' }).text
    ).toMatch(/^The Edpuzzle reader couldn't read this page/);
    const refused = sendNote({ kind: 'not-youtube' });
    expect(refused.ok).toBe(false);
    expect(refused.text).toMatch(/stored on Edpuzzle/);
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
      /no text that can be sent/
    );
    expect(sendNote({ kind: 'reply', reply: undefined }).ok).toBe(false);
  });
});
