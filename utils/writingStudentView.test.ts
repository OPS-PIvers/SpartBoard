import { describe, expect, it } from 'vitest';
import {
  deriveWritingView,
  type WritingResponseFacts,
  type WritingSessionFacts,
  type WritingTabFacts,
} from './writingStudentView';

const NOW = 1_000_000;
const session: WritingSessionFacts = {
  status: 'active',
  closeAt: null,
  dueAt: NOW + 60_000,
  minWords: 3,
  maxWords: 6,
  enforceWordLimit: true,
};
const tab: WritingTabFacts = {
  myTabId: 'me',
  holding: true,
  claiming: false,
  online: true,
  dirty: false,
  slow: false,
  refused: false,
  copyOk: true,
  turningIn: false,
  html: '<p>one two three four</p>',
};
const response = (
  over: Partial<WritingResponseFacts> = {}
): WritingResponseFacts => ({
  status: 'draft',
  tabId: 'me',
  classId: 'c1',
  ...over,
});
const derive = (
  over: {
    session?: Partial<WritingSessionFacts>;
    response?: WritingResponseFacts | null;
    tab?: Partial<WritingTabFacts>;
    pointer?: { closeAt?: number | null; dueAt?: number | null };
  } = {}
) =>
  deriveWritingView({
    session: { ...session, ...over.session },
    response: over.response === undefined ? response() : over.response,
    pointer: over.pointer ?? null,
    tab: { ...tab, ...over.tab },
    now: NOW,
  });

describe('deriveWritingView', () => {
  it('waits for the response before deciding', () => {
    expect(
      deriveWritingView({
        session,
        response: undefined,
        pointer: null,
        tab,
        now: NOW,
      }).mode
    ).toBe('loading');
  });

  it('shows Start before the first open', () => {
    expect(derive({ response: null }).mode).toBe('not-started');
  });

  it('lets the holding tab write and turn in inside the word limits', () => {
    expect(derive()).toMatchObject({
      mode: 'writing',
      editable: true,
      showTurnIn: true,
      turnInBlockedBy: null,
      wordCount: 4,
      saveState: 'saved',
    });
  });

  it('blocks turn in outside enforced limits, with the words to go (D7)', () => {
    expect(derive({ tab: { html: '<p>one</p>' } })).toMatchObject({
      turnInBlockedBy: 'too-short',
      wordGap: 2,
    });
    expect(derive({ tab: { html: '<p>1 2 3 4 5 6 7 8</p>' } })).toMatchObject({
      turnInBlockedBy: 'too-long',
      wordGap: 2,
    });
    expect(
      derive({
        session: { enforceWordLimit: false },
        tab: { html: '<p>one</p>' },
      }).turnInBlockedBy
    ).toBeNull();
  });

  it('never turns in an empty piece, or while offline', () => {
    expect(derive({ tab: { html: '' } }).turnInBlockedBy).toBe('empty');
    expect(derive({ tab: { online: false } }).turnInBlockedBy).toBe('offline');
  });

  it('says saved on this device while offline or slow with unsaved text (D24)', () => {
    expect(derive({ tab: { dirty: true } }).saveState).toBe('saving');
    expect(derive({ tab: { dirty: true, online: false } }).saveState).toBe(
      'device'
    );
    expect(derive({ tab: { dirty: true, slow: true } }).saveState).toBe(
      'device'
    );
  });

  it('says not saved when neither the server nor the device has the text', () => {
    expect(
      derive({ tab: { dirty: true, online: false, copyOk: false } }).saveState
    ).toBe('failed');
    expect(derive({ tab: { dirty: true, refused: true } }).saveState).toBe(
      'device'
    );
    expect(
      derive({ tab: { dirty: true, refused: true, copyOk: false } }).saveState
    ).toBe('failed');
  });

  it('holds the editor still while Turn in sends the text on screen', () => {
    const v = derive({ tab: { turningIn: true } });
    expect(v.mode).toBe('writing');
    expect(v.editable).toBe(false);
  });

  it('makes this tab read-only once another tab claims the piece (D23)', () => {
    expect(derive({ response: response({ tabId: 'other' }) })).toMatchObject({
      mode: 'taken-over',
      editable: false,
      showTurnIn: false,
    });
    expect(
      derive({
        response: response({ tabId: 'other' }),
        tab: { holding: false },
      }).mode
    ).toBe('taken-over');
  });

  it('does not flash a takeover while its own claim is landing', () => {
    expect(
      derive({
        response: response({ tabId: 'old' }),
        tab: { holding: false, claiming: true },
      }).mode
    ).toBe('loading');
  });

  it('locks turned-in work and offers Take back while it is allowed (D12)', () => {
    expect(
      derive({ response: response({ status: 'turned-in' }) })
    ).toMatchObject({ mode: 'turned-in', editable: false, showTakeBack: true });
    expect(
      derive({
        response: response({ status: 'turned-in' }),
        session: { dueAt: NOW - 1 },
      }).showTakeBack
    ).toBe(false);
    expect(
      derive({
        response: response({ status: 'turned-in', deadlineAt: NOW + 60_000 }),
        session: { timeLimitMinutes: 30 },
      }).showTakeBack
    ).toBe(false);
    expect(
      derive({
        response: response({ status: 'turned-in' }),
        session: { timeLimitMinutes: 30 },
      }).showTakeBack
    ).toBe(true);
    expect(
      derive({
        response: response({ status: 'turned-in' }),
        session: { status: 'ended', endedAt: NOW - 200_000 },
      }).showTakeBack
    ).toBe(false);
    expect(
      derive({
        response: response({ status: 'turned-in' }),
        session: { closeAt: NOW - 200_000 },
      }).showTakeBack
    ).toBe(false);
    expect(
      derive({
        response: response({ status: 'turned-in' }),
        pointer: { dueAt: NOW + 5 },
        session: { dueAt: NOW - 1 },
      }).showTakeBack
    ).toBe(true);
  });

  it('shows returned work read-only and a revision as writable again', () => {
    expect(
      derive({ response: response({ status: 'returned' }) })
    ).toMatchObject({ mode: 'returned', editable: false, showTakeBack: false });
    expect(
      derive({ response: response({ status: 'revising' }) })
    ).toMatchObject({ mode: 'writing', status: 'revising', editable: true });
  });

  it('closes when the session ends or the close passes', () => {
    expect(derive({ session: { status: 'ended' } }).mode).toBe('closed');
    expect(derive({ pointer: { closeAt: NOW - 10 * 60_000 } }).mode).toBe(
      'closed'
    );
    expect(derive({ response: null, session: { status: 'ended' } }).mode).toBe(
      'closed'
    );
  });
});
