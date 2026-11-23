import { describe, expect, it } from 'vitest';
import { adminTabOf, isMyStudentTab, isRecording } from './studentTourHandoff';

const win = (opener: unknown = null) => ({ opener }) as unknown as Window;

describe('studentTourHandoff', () => {
  it("finds the admin's tab two openers up", () => {
    const admin = win();
    const teacher = win(admin);
    expect(adminTabOf(win(teacher))).toBe(admin);
    expect(adminTabOf(win(null))).toBeNull();
    expect(adminTabOf(win(win(null)))).toBeNull();
  });

  it('accepts only a student tab this admin tab opened through a teacher tab', () => {
    const admin = win();
    const student = win(win(admin));
    expect(isMyStudentTab(student, admin)).toBe(true);
    expect(isMyStudentTab(win(win(win())), admin)).toBe(false);
    // A tab the admin opened directly is not a student tab.
    expect(isMyStudentTab(win(admin), admin)).toBe(false);
    expect(isMyStudentTab(null, admin)).toBe(false);
  });

  it('checks the recording shape', () => {
    expect(
      isRecording({ frames: [new Blob(['a'])], redactions: [[]], steps: [] })
    ).toBe(true);
    expect(isRecording({ frames: ['not a blob'], steps: [] })).toBe(false);
    expect(isRecording(null)).toBe(false);
    const blob = new Blob(['a']);
    // Review reads a blur list per frame, so a missing or short one is refused.
    expect(isRecording({ frames: [blob], steps: [] })).toBe(false);
    expect(isRecording({ frames: [blob], redactions: [], steps: [] })).toBe(
      false
    );
    const step = (frameIndex: number) => ({ id: 's', frameIndex });
    expect(
      isRecording({ frames: [blob], redactions: [[]], steps: [step(-1)] })
    ).toBe(true);
    expect(
      isRecording({ frames: [blob], redactions: [[]], steps: [step(1)] })
    ).toBe(false);
    expect(
      isRecording({ frames: [blob], redactions: [[]], steps: ['x'] })
    ).toBe(false);
    expect(
      isRecording({ frames: [blob], redactions: [[]], raw: [], steps: [] })
    ).toBe(false);
  });
});
