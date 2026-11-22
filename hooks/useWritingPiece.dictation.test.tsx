// Speech to text in the Writing editor: an announced insert is logged as dictated, paste blocking or not.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readDeviceCopy } from '@/utils/writingDeviceCopy';
import { parseWritingLog } from '@/utils/writingLog';
import { useWritingPiece } from './useWritingPiece';

const RESPONSE = {
  status: 'draft',
  tabId: 'other',
  saveCount: 1,
  html: '',
  logChunk: 0,
  summary: { wordCount: 0, savedAt: 0 },
};

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => () =>
    Promise.resolve({ data: { logChunk: 0, logs: [''] } }),
}));
vi.mock('firebase/firestore', () => {
  const snap = () => ({ exists: () => true, data: () => RESPONSE });
  return {
    doc: (..._parts: unknown[]) => ({}),
    getDoc: () => Promise.resolve(snap()),
    onSnapshot: (_ref: unknown, next: (s: unknown) => void) => {
      next(snap());
      return () => undefined;
    },
    serverTimestamp: () => 'now',
    writeBatch: () => ({
      update: vi.fn(),
      set: vi.fn(),
      commit: () => Promise.resolve(),
    }),
  };
});

const UID = 'student-1';
const SID = 'session-1';

function mountEditor() {
  const root = document.createElement('div');
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  // jsdom has no isContentEditable.
  Object.defineProperty(el, 'isContentEditable', { value: true });
  root.append(el);
  document.body.append(root);
  return { root, el };
}

async function holdPiece(allowPaste: boolean) {
  const hook = renderHook(() =>
    useWritingPiece({
      sessionId: SID,
      studentUid: UID,
      allowPaste,
      closed: false,
    })
  );
  await waitFor(() => expect(hook.result.current.holding).toBe(true));
  const editor = mountEditor();
  act(() => hook.result.current.bindEditor(editor.root));
  return { hook, ...editor };
}

/** What the tab recorded so far, read from the device copy a page hide writes. */
function recorded() {
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  const copy = readDeviceCopy(window.localStorage, UID, SID);
  if (!copy) throw new Error('no device copy');
  return { summary: copy.summary, edits: parseWritingLog(copy.log).edits };
}

const beforeInput = (el: HTMLElement, inputType: string) => {
  const e = new InputEvent('beforeinput', {
    inputType,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(e);
  return e;
};

const typeInto = (el: HTMLElement, text: string) => {
  beforeInput(el, 'insertText');
  el.textContent = text;
  el.dispatchEvent(
    new InputEvent('input', { inputType: 'insertText', bubbles: true })
  );
};

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('useWritingPiece dictation', () => {
  it('logs a passage inserted with no input event as dictated', async () => {
    const { hook, el } = await holdPiece(true);
    typeInto(el, 'I ');
    await act(async () => {
      hook.result.current.onDictationInsert('said this');
      el.textContent = 'I Said this. ';
      hook.result.current.onEditorChange('I Said this. ');
      await Promise.resolve();
    });
    typeInto(el, 'I Said this. x');
    const { summary, edits } = recorded();
    expect(edits.map((e) => e.kind)).toEqual(['typed', 'dictated', 'typed']);
    expect(edits[1].ins).toBe('Said this. ');
    expect(summary).toMatchObject({
      dictatedCount: 1,
      dictatedChars: 11,
      pasteCount: 0,
      untypedCount: 0,
    });
  });

  it('lets dictated text in while paste is blocked, and never calls it a paste', async () => {
    const { hook, el } = await holdPiece(false);
    // With no announcement the guard still cancels a native paste.
    let blocked = false;
    act(() => {
      blocked = beforeInput(el, 'insertFromPaste').defaultPrevented;
    });
    expect(blocked).toBe(true);
    expect(hook.result.current.notice).toBe('paste-blocked');
    act(() => hook.result.current.clearNotice());

    await act(async () => {
      hook.result.current.onDictationInsert('spoken words');
      // Worst case: the editor's insert reaches the page looking like a paste, in two input events.
      const before = beforeInput(el, 'insertFromPaste');
      expect(before.defaultPrevented).toBe(false);
      el.textContent = 'spoken ';
      el.dispatchEvent(
        new InputEvent('input', { inputType: 'insertFromPaste', bubbles: true })
      );
      el.textContent = 'spoken words';
      el.dispatchEvent(
        new InputEvent('input', { inputType: 'insertText', bubbles: true })
      );
      hook.result.current.onEditorChange('spoken words');
      await Promise.resolve();
    });
    expect(hook.result.current.notice).toBeNull();
    const { summary, edits } = recorded();
    expect(edits.map((e) => e.kind)).toEqual(['dictated']);
    expect(edits[0].ins).toBe('spoken words');
    expect(summary).toMatchObject({
      dictatedCount: 1,
      dictatedChars: 12,
      pasteCount: 0,
      pastedChars: 0,
      untypedCount: 0,
    });
  });

  it('labels a passage that lands after the announcing turn', async () => {
    const { hook, el } = await holdPiece(false);
    await act(async () => {
      hook.result.current.onDictationInsert('late words');
      await Promise.resolve();
    });
    await act(async () => {
      el.textContent = 'late words ';
      hook.result.current.onEditorChange('late words ');
      await Promise.resolve();
    });
    const { summary, edits } = recorded();
    expect(edits.map((e) => e.kind)).toEqual(['dictated']);
    expect(summary).toMatchObject({ dictatedCount: 1, untypedCount: 0 });
  });
});
