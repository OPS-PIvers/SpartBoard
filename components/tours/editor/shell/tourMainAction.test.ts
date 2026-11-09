import { describe, expect, it } from 'vitest';
import {
  stepNeedsText,
  tourMainAction,
  type TourMainInput,
} from './tourMainAction';

const input = (patch: Partial<TourMainInput> = {}): TourMainInput => ({
  kind: 'web',
  stepCount: 3,
  stepsWithoutText: 0,
  publish: 'draft',
  checkNeeded: false,
  canCheck: true,
  ...patch,
});

describe('tourMainAction', () => {
  it('asks for text first when steps have none', () => {
    expect(tourMainAction(input({ stepsWithoutText: 2 }))).toEqual({
      state: 'write',
      disabled: false,
      blocker: { kind: 'needs-text', count: 2 },
    });
  });

  it('asks for a check once every step has text and the targets changed', () => {
    expect(tourMainAction(input({ checkNeeded: true }))).toEqual({
      state: 'check',
      disabled: false,
      blocker: { kind: 'check-needed' },
    });
  });

  it('keeps Check tour while a check runs, disabled', () => {
    expect(
      tourMainAction(input({ checkNeeded: true, checking: true }))
    ).toEqual({
      state: 'check',
      disabled: true,
      blocker: { kind: 'checking' },
    });
  });

  it('disables Check tour where the browser cannot run it', () => {
    const action = tourMainAction(
      input({ checkNeeded: true, canCheck: false })
    );
    expect(action.state).toBe('check');
    expect(action.disabled).toBe(true);
  });

  it('offers Publish when nothing is in the way', () => {
    expect(tourMainAction(input())).toEqual({
      state: 'publish',
      disabled: false,
      blocker: null,
    });
    expect(tourMainAction(input({ publish: 'changed' })).state).toBe('publish');
  });

  it('shows Published, disabled, until something changes', () => {
    expect(
      tourMainAction(input({ publish: 'published', stepsWithoutText: 1 }))
    ).toEqual({ state: 'published', disabled: true, blocker: null });
  });

  it('waits for the published copy before Publish is enabled', () => {
    expect(tourMainAction(input({ publish: null })).disabled).toBe(true);
  });

  it('blocks Publish on another reason and names it', () => {
    expect(tourMainAction(input({ other: 'Student data in step 2' }))).toEqual({
      state: 'publish',
      disabled: true,
      blocker: { kind: 'other', label: 'Student data in step 2' },
    });
  });

  it('cannot publish a tour with no steps', () => {
    expect(tourMainAction(input({ stepCount: 0 }))).toEqual({
      state: 'publish',
      disabled: true,
      blocker: { kind: 'no-steps' },
    });
  });

  it('disables the main button while busy', () => {
    expect(tourMainAction(input({ busy: true })).disabled).toBe(true);
    expect(
      tourMainAction(input({ busy: true, stepsWithoutText: 1 })).disabled
    ).toBe(true);
  });

  it('skips Check for a Live tour with no playtest notes open', () => {
    expect(tourMainAction(input({ kind: 'live' })).state).toBe('publish');
    expect(
      tourMainAction(input({ kind: 'live', checkNeeded: true })).state
    ).toBe('check');
  });
});

describe('stepNeedsText', () => {
  it('needs text only when both title and tip are blank', () => {
    expect(stepNeedsText({})).toBe(true);
    expect(stepNeedsText({ label: '  ', text: '' })).toBe(true);
    expect(stepNeedsText({ label: 'Open Tools' })).toBe(false);
    expect(stepNeedsText({ text: 'Click here' })).toBe(false);
  });
});
