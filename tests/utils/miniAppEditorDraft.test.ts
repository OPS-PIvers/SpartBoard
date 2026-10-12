import { describe, expect, it } from 'vitest';
import {
  blankQuestion,
  checkMiniApp,
  fromDrafts,
  toDrafts,
} from '@/utils/miniAppEditorDraft';
import type { MiniAppAnswerKey, MiniAppManifest } from '@/types';

const manifest: MiniAppManifest = {
  questions: [
    { id: 'q1', type: 'mc', prompt: 'Pick', points: 2 },
    { id: 'q2', type: 'numeric', prompt: 'Count' },
    { id: 'q3', type: 'tf', prompt: 'True?' },
    { id: 'q4', type: 'short', prompt: 'Name' },
    { id: 'q5', type: 'order', prompt: 'Sort' },
    { id: 'q6', type: 'other', prompt: 'Build' },
  ],
};
const key: MiniAppAnswerKey = {
  questions: {
    q1: { correct: 'B' },
    q2: { correct: 15, tolerance: 0.5 },
    q3: { correct: false },
    q4: { accepted: ['numerator', 'top'] },
    q5: { correct: ['a', 'b', 'c'] },
  },
};

describe('mini app editor drafts', () => {
  it('round-trips a manifest and key', () => {
    expect(fromDrafts(toDrafts(manifest, key))).toEqual({ manifest, key });
  });

  it('drops blank answers from the key', () => {
    const rows = toDrafts(manifest, null);
    expect(fromDrafts(rows).key.questions).toEqual({});
  });

  it('picks the next free id', () => {
    expect(blankQuestion(toDrafts(manifest, key)).id).toBe('q7');
  });
});

describe('checkMiniApp', () => {
  const ok =
    '<button data-spart-submit>Go</button><script>SpartBoard.submit({})</script>';

  it('passes a wired app', () => {
    expect(checkMiniApp(ok, manifest, key)).toEqual([]);
  });

  it('flags a missing submit call and button', () => {
    expect(checkMiniApp('<p>hi</p>', manifest, key)).toEqual([
      'The app never sends results to SpartBoard.',
      'The app has no Submit button for SpartBoard to show.',
    ]);
  });

  it('flags duplicate ids', () => {
    const dup = { questions: [manifest.questions[0], manifest.questions[0]] };
    expect(checkMiniApp(ok, dup, { questions: {} })).toEqual([
      'Two questions use the ID q1.',
    ]);
  });

  it('flags a key for a question the app does not have', () => {
    expect(
      checkMiniApp(ok, manifest, { questions: { q9: { correct: 'x' } } })
    ).toEqual(['The answer key has q9, which is not a question.']);
  });

  it('flags an answer written into the code, not a listed choice', () => {
    const k = { questions: { q4: { accepted: ['numerator'] } } };
    expect(
      checkMiniApp(
        `${ok}<script>var choices=['numerator','denominator']</script>`,
        manifest,
        k
      )
    ).toEqual([]);
    expect(
      checkMiniApp(
        `${ok}<script>var q={answer: 'numerator'}</script>`,
        manifest,
        k
      )
    ).toEqual(['The app shows the answer to q4 in its code.']);
  });
});
