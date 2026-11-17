import { describe, expect, it } from 'vitest';
import {
  BIG_LOG_BYTES,
  BIG_LOG_EVERY_MS,
  INSERT_APPROVAL_MS,
  LOG_EVERY_MS,
  insertApproved,
  isLogDue,
  refusedSaveAction,
  saveKeyOf,
  saveStateOf,
  turnInFlush,
} from './writingSaveFlow';

describe('saveKeyOf', () => {
  it('ties a save to its tab and counter, as the rules check', () => {
    expect(saveKeyOf('tab-1', 7)).toBe('tab-1:7');
  });
});

describe('isLogDue', () => {
  const base = {
    logDirty: true,
    closing: false,
    force: false,
    now: 100_000,
    lastLogAt: 100_000 - LOG_EVERY_MS,
    logBytes: 10,
  };

  it('sends a dirty log every 20 s', () => {
    expect(isLogDue(base)).toBe(true);
    expect(isLogDue({ ...base, lastLogAt: base.now - 1_000 })).toBe(false);
    expect(isLogDue({ ...base, logDirty: false, force: true })).toBe(false);
  });

  it('slows to once a minute for a big log (AB-201)', () => {
    const big = { ...base, logBytes: BIG_LOG_BYTES + 1 };
    expect(isLogDue(big)).toBe(false);
    expect(isLogDue({ ...big, lastLogAt: base.now - BIG_LOG_EVERY_MS })).toBe(
      true
    );
  });

  it('sends at once for a full chunk or a forced save', () => {
    const recent = { ...base, lastLogAt: base.now };
    expect(isLogDue({ ...recent, closing: true })).toBe(true);
    expect(isLogDue({ ...recent, force: true })).toBe(true);
  });
});

describe('refusedSaveAction', () => {
  const server = { tabId: 'me', status: 'draft' as const, saveCount: 9 };

  it('retries from the server counter while the piece is still ours and open', () => {
    expect(refusedSaveAction(server, 'me', false)).toBe('retry');
    expect(
      refusedSaveAction({ ...server, status: 'revising' }, 'me', false)
    ).toBe('retry');
  });

  it('lets go once another tab claimed it, it locked, or it closed', () => {
    expect(refusedSaveAction({ ...server, tabId: 'other' }, 'me', false)).toBe(
      'lost'
    );
    expect(
      refusedSaveAction({ ...server, status: 'turned-in' }, 'me', false)
    ).toBe('lost');
    expect(refusedSaveAction(server, 'me', true)).toBe('lost');
    expect(refusedSaveAction(null, 'me', false)).toBe('lost');
  });
});

describe('saveStateOf', () => {
  const base = {
    dirty: true,
    online: true,
    slow: false,
    refused: false,
    copyOk: true,
  };

  it('is saved once the server has the text, whatever the log', () => {
    expect(saveStateOf({ ...base, dirty: false, copyOk: false })).toBe('saved');
  });

  it('is saving while a save is on its way', () => {
    expect(saveStateOf(base)).toBe('saving');
  });

  it('claims the device copy only when it was written', () => {
    expect(saveStateOf({ ...base, online: false })).toBe('device');
    expect(saveStateOf({ ...base, slow: true })).toBe('device');
    expect(saveStateOf({ ...base, refused: true })).toBe('device');
    expect(saveStateOf({ ...base, online: false, copyOk: false })).toBe(
      'failed'
    );
    expect(saveStateOf({ ...base, refused: true, copyOk: false })).toBe(
      'failed'
    );
  });
});

describe('turnInFlush', () => {
  it('sends the text on screen under the next counter when it changed', () => {
    expect(
      turnInFlush({ html: '<p>b</p>', savedHtml: '<p>a</p>', confirmed: 4 })
    ).toEqual({ html: '<p>b</p>', saveCount: 5 });
  });

  it('resends the saved counter when nothing changed, which carries nothing new', () => {
    expect(
      turnInFlush({ html: '<p>a</p>', savedHtml: '<p>a</p>', confirmed: 4 })
    ).toEqual({ html: '<p>a</p>', saveCount: 4 });
  });
});

describe('insertApproved (D8)', () => {
  it('lets typing and other inputs through', () => {
    expect(insertApproved('insertText', null, 0)).toBe(true);
    expect(insertApproved('deleteContentBackward', null, 0)).toBe(true);
  });

  it('cancels a native paste, drop or yank the page never approved', () => {
    for (const t of [
      'insertFromPaste',
      'insertFromPasteAsQuotation',
      'insertFromDrop',
      'insertFromYank',
    ])
      expect(insertApproved(t, null, 5_000)).toBe(false);
  });

  it('takes an approval only from the last second', () => {
    expect(insertApproved('insertFromPaste', 5_000, 5_500)).toBe(true);
    expect(
      insertApproved('insertFromPaste', 5_000, 5_000 + INSERT_APPROVAL_MS)
    ).toBe(false);
  });
});
