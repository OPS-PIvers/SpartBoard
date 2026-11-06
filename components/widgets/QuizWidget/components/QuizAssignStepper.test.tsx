import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import { defaultWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';
import { SAMPLE_ROSTERS } from '@/components/common/library/assignStepper/assignStepperTestRosters';
import { QuizAssignStepper } from './QuizAssignStepper';
import {
  DEFAULT_WRITTEN_ANSWERS,
  type WrittenAnswersValue,
} from '@/components/common/library/assignStepper/WrittenAnswersStep.format';

const Harness: React.FC<{ staff?: boolean }> = ({ staff = false }) => {
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
      audience={
        staff
          ? { audience: 'staff', setAudience: vi.fn(), canAssignToStaff: true }
          : undefined
      }
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

describe('QuizAssignStepper When step for Staff', () => {
  it('offers Manual, which starts the whole assignment', () => {
    render(<Harness staff />);
    fireEvent.click(screen.getByRole('button', { name: /^\dWhen/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Manual' }));
    expect(
      screen.getByText('Starts paused. You start and pause it.')
    ).toBeInTheDocument();
  });
});

const WrittenHarness: React.FC<{ offered: boolean }> = ({ offered }) => {
  const [written, setWritten] = useState<WrittenAnswersValue>(
    DEFAULT_WRITTEN_ANSWERS
  );
  return (
    <QuizAssignStepper
      title="Unit 4"
      rosters={SAMPLE_ROSTERS}
      classes={{ classIds: ['c1'], studentsByClass: {} }}
      onClassesChange={vi.fn()}
      when={defaultWhenValue({
        activity: 'quiz',
        bellAvailable: false,
        manualAvailable: true,
      })}
      onWhenChange={vi.fn()}
      behavior={getQuizAssignPrefill(null)}
      onBehaviorChange={vi.fn()}
      hasManualGrading
      handRaiseMode="teacher-choice"
      submitLabel="Assign"
      {...(offered
        ? { written: { value: written, onChange: setWritten, count: 3 } }
        : {})}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
};

describe('QuizAssignStepper Written answers step', () => {
  it('is left out unless offered', () => {
    render(<WrittenHarness offered={false} />);
    expect(screen.queryByText('Written answers')).not.toBeInTheDocument();
  });

  it('switches to paper, shows spares, and prints on assign', () => {
    render(<WrittenHarness offered />);
    expect(screen.getByText('On the device')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Assign$/ })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^\dWritten answers/ }));
    fireEvent.click(screen.getByRole('button', { name: 'On paper' }));
    expect(screen.getByLabelText('Spare sheets')).toHaveValue(2);
    expect(
      screen.getByRole('button', { name: /Assign and print/ })
    ).toBeInTheDocument();
  });
});
