import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';
import { requestStartTour } from '@/components/tours/tourState';
import StudentTourLayer from './StudentTourLayer';

const set = {
  id: 'stu-1',
  title: 'Turn in your work',
  mode: 'tour',
  imageUrls: [],
  steps: [
    {
      id: 's0',
      label: 'Find your work here',
      tour: { anchor: 'student.help', action: 'observe' },
    },
  ],
  tourSetup: { widgets: [], useTeacherBoard: true },
} as unknown as GuidedLearningSet;

vi.mock('@/components/tours/publishedTours', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadRunnableTour: () => Promise.resolve(set),
}));
vi.mock('@/components/tours/stepSnapshot', () => ({
  captureStepSnapshot: () => Promise.resolve(null),
}));
vi.mock('./useStudentHelpTours', () => ({ useStudentHelpTours: () => [] }));

// The real runner under the student stand-ins: a field the stand-ins lack would throw here.
describe('StudentTourLayer', () => {
  it('plays a student tour with the real runner', async () => {
    render(
      <>
        <button type="button" data-tour="student.help">
          Help
        </button>
        <StudentTourLayer identity={{ uid: 's1', orgId: 'orono' }} />
      </>
    );
    act(() => requestStartTour({ setId: 'stu-1' }));
    await waitFor(
      () =>
        expect(
          screen.getAllByText('Find your work here').length
        ).toBeGreaterThan(0),
      { timeout: 5000 }
    );
  });
});
