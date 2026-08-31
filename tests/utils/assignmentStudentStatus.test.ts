import { describe, it, expect } from 'vitest';
import {
  deriveQuizStudentStatus,
  deriveCompletedAtStudentStatus,
  deriveSubmissionStudentStatus,
} from '@/utils/assignmentStudentStatus';

describe('deriveQuizStudentStatus', () => {
  it('not-started for no response or joined status', () => {
    expect(deriveQuizStudentStatus(undefined)).toBe('not-started');
    expect(deriveQuizStudentStatus({ status: 'joined' })).toBe('not-started');
  });

  it('in-progress while taking', () => {
    expect(deriveQuizStudentStatus({ status: 'in-progress' })).toBe(
      'in-progress'
    );
  });

  it('submitted when completed with no manual grades yet', () => {
    expect(deriveQuizStudentStatus({ status: 'completed' })).toBe('submitted');
    expect(deriveQuizStudentStatus({ status: 'completed', grading: {} })).toBe(
      'submitted'
    );
  });

  it('graded once at least one manual grade exists', () => {
    expect(
      deriveQuizStudentStatus({
        status: 'completed',
        grading: {
          q1: { pointsAwarded: 3, gradedBy: 'teacher-1', gradedAt: 1 },
        },
      })
    ).toBe('graded');
  });
});

describe('deriveCompletedAtStudentStatus', () => {
  it('not-started with no response doc', () => {
    expect(deriveCompletedAtStudentStatus(null, false)).toBe('not-started');
  });
  it('in-progress when response exists but not completed', () => {
    expect(deriveCompletedAtStudentStatus(null, true)).toBe('in-progress');
    expect(deriveCompletedAtStudentStatus(undefined, true)).toBe('in-progress');
  });
  it('submitted once completedAt is set', () => {
    expect(deriveCompletedAtStudentStatus(12345, true)).toBe('submitted');
  });
});

describe('deriveSubmissionStudentStatus', () => {
  it('not-started with no submission, submitted otherwise', () => {
    expect(deriveSubmissionStudentStatus(false)).toBe('not-started');
    expect(deriveSubmissionStudentStatus(true)).toBe('submitted');
  });
});
