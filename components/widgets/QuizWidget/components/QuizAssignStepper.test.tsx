import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import { defaultWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';
import { SAMPLE_ROSTERS } from '@/components/common/library/assignStepper/assignStepperTestRosters';
import { QuizAssignStepper } from './QuizAssignStepper';

const Harness: React.FC = () => {
  const [when, setWhen] = useState(() =>
    defaultWhenValue({
      activity: 'quiz',
      bellAvailable: false,
      manualAvailable: false,
    })
  );
  return (
    <QuizAssignStepper
      title="Unit 1 checkpoint"
      rosters={SAMPLE_ROSTERS}
      classes={{ classIds: ['c1', 'c2'], studentsByClass: {} }}
      onClassesChange={vi.fn()}
      when={when}
      onWhenChange={setWhen}
      behavior={getQuizAssignPrefill(null)}
      onBehaviorChange={vi.fn()}
      hasManualGrading={false}
      handRaiseMode="teacher-choice"
      submitLabel="Assign"
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
};

describe('QuizAssignStepper When step without bell periods', () => {
  it('offers a due date per class with one shared Opens', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^\dWhen/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Different time for each class' })
    );
    expect(screen.getAllByText('Opens')).toHaveLength(1);
    expect(screen.getAllByText('Closes')).toHaveLength(2);
  });
});
