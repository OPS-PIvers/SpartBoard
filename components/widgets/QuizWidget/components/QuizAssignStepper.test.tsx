import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import { defaultWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';
import { SAMPLE_ROSTERS } from '@/components/common/library/assignStepper/assignStepperTestRosters';
import { QuizAssignStepper } from './QuizAssignStepper';
import type { ClassRoster, StudentOverride } from '@/types';
import type { AssignClassesValue } from '@/components/common/library/assignStepper/assignClassesValue';
import { AuthContext } from '@/context/AuthContextValue';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  classStudentRows,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import {
  DEFAULT_WRITTEN_ANSWERS,
  type WrittenAnswersValue,
} from '@/components/common/library/assignStepper/WrittenAnswersStep.format';

const Harness: React.FC<{ staff?: boolean; onAssignOnPaper?: () => void }> = ({
  staff = false,
  onAssignOnPaper,
}) => {
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
      onAssignOnPaper={onAssignOnPaper}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
};

describe('QuizAssignStepper Assign on paper', () => {
  it('is left out unless offered', () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: 'Assign on paper' })
    ).toBeNull();
  });

  it('leaves for the paper flow from beside Assign', () => {
    const onAssignOnPaper = vi.fn();
    render(<Harness onAssignOnPaper={onAssignOnPaper} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign on paper' }));
    expect(onAssignOnPaper).toHaveBeenCalledTimes(1);
  });
});

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
        ? {
            written: {
              value: written,
              onChange: setWritten,
              count: 1,
              rows: [
                {
                  questionId: 'w1',
                  label: '5',
                  text: 'Use the provided resources and write an essay.',
                  size: written.boxSizes.w1 ?? 'M',
                  style: written.boxStyles.w1?.style ?? 'lines',
                },
              ],
            },
          }
        : {})}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
};

describe('QuizAssignStepper Written answers step', () => {
  it('is left out unless offered', () => {
    render(<WrittenHarness offered={false} />);
    expect(screen.queryByText(/Written answers/)).not.toBeInTheDocument();
  });

  it('switches to paper, shows spares, and prints on assign', () => {
    render(<WrittenHarness offered />);
    expect(
      screen.getByText('Written answers on the device')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Assign$/ })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /^\dAdditional settings/ })
    );
    fireEvent.click(screen.getByRole('radio', { name: 'On paper' }));
    expect(screen.getByLabelText('Spare sheets')).toHaveValue(2);
    expect(
      screen.getByRole('button', { name: /Assign and print/ })
    ).toBeInTheDocument();
  });

  it('picks page count and paper type for each written question on paper', () => {
    render(<WrittenHarness offered />);
    fireEvent.click(
      screen.getByRole('button', { name: /^\dAdditional settings/ })
    );
    expect(
      screen.queryByLabelText('Question 5 box size')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'On paper' }));
    expect(
      screen.getByText('Use the provided resources and write an essay.')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Question 5 box size'), {
      target: { value: 'full' },
    });
    fireEvent.change(screen.getByLabelText('Question 5 answer style'), {
      target: { value: 'graph' },
    });
    expect(screen.getByLabelText('Question 5 box size')).toHaveValue('full');
    expect(screen.getByLabelText('Question 5 answer style')).toHaveValue(
      'graph'
    );
    expect(
      screen.queryByRole('option', { name: 'Custom image' })
    ).not.toBeInTheDocument();
  });
});

describe('QuizAssignStepper step order', () => {
  it('puts the rules first and the extra settings last', () => {
    render(<WrittenHarness offered />);
    const titles = screen
      .getAllByRole('button', { expanded: false })
      .concat(screen.getAllByRole('button', { expanded: true }))
      .map((b) => b.textContent ?? '')
      .filter((text) => /^\d/.test(text))
      .sort()
      .map((text) => text.replace(/^\d/, ''));
    expect(titles[0]).toMatch(/^Classes/);
    expect(titles[1]).toMatch(/^When/);
    expect(titles[2]).toMatch(/^Attempts and order/);
    expect(titles[3]).toMatch(/^Quiz integrity/);
    expect(titles[4]).toMatch(/^Results/);
    expect(titles[5]).toMatch(/^Additional settings/);
  });

  it('moves raise a hand out of Results into the last step', () => {
    render(<WrittenHarness offered />);
    fireEvent.click(screen.getByRole('button', { name: /^\dResults/ }));
    expect(
      screen.queryByText('Allow students to raise a hand')
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /^\dAdditional settings/ })
    );
    expect(
      screen.getByText('Allow students to raise a hand')
    ).toBeInTheDocument();
  });
});

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null }),
}));

const PRESET_ROSTERS: ClassRoster[] = SAMPLE_ROSTERS.map((r) =>
  r.id === 'c1'
    ? {
        ...r,
        defaultOverridesByStudentId: {
          a: { readAloud: true, timeMultiplier: 1.5 },
          c: { readAloud: true, timeMultiplier: 1.5 },
        },
      }
    : r
);

const PresetHarness: React.FC<{
  onTargeting: (next: AssignTargetingValue) => void;
  onSubmit?: (extra: unknown) => void;
}> = ({ onTargeting, onSubmit = vi.fn() }) => {
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  const auth = {
    canAccessFeature: (id: string) => id === 'quiz-read-aloud',
  } as unknown as React.ContextType<typeof AuthContext>;
  return (
    <AuthContext.Provider value={auth}>
      <QuizAssignStepper
        title="Unit 1 checkpoint"
        rosters={PRESET_ROSTERS}
        classes={{ classIds: ['c1'], studentsByClass: {} }}
        onClassesChange={vi.fn()}
        when={defaultWhenValue({
          activity: 'quiz',
          bellAvailable: false,
          manualAvailable: false,
        })}
        onWhenChange={vi.fn()}
        behavior={getQuizAssignPrefill(null)}
        onBehaviorChange={vi.fn()}
        modifications={{
          targeting,
          onTargetingChange: (next) => {
            setTargeting(next);
            onTargeting(next);
          },
          quizContext: { questions: [], rubrics: [] },
        }}
        hasManualGrading={false}
        handRaiseMode="teacher-choice"
        submitLabel="Assign"
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    </AuthContext.Provider>
  );
};

describe('QuizAssignStepper class presets', () => {
  it('arrive as a group in the Modifications step', () => {
    render(<PresetHarness onTargeting={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^\dModifications/ }));
    expect(screen.getByText('Reading group A')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Read aloud' })).toBeChecked();
  });

  it('can be removed for this assignment only', () => {
    const onTargeting = vi.fn();
    render(<PresetHarness onTargeting={onTargeting} />);
    fireEvent.click(screen.getByRole('button', { name: /^\dModifications/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove group' }));
    const last = onTargeting.mock.calls.at(-1)?.[0] as AssignTargetingValue;
    expect(Object.values(last.overridesByKey)).toEqual([{}, {}]);
    expect(PRESET_ROSTERS[0].defaultOverridesByStudentId?.a).toEqual({
      readAloud: true,
      timeMultiplier: 1.5,
    });
  });

  it('assign serves what the step shows, even with no edits', () => {
    const onSubmit = vi.fn();
    render(<PresetHarness onTargeting={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    const extra = onSubmit.mock.calls[0]?.[0] as {
      overridesByKey: AssignTargetingValue['overridesByKey'];
    };
    expect(Object.values(extra.overridesByKey)).toEqual([
      { readAloud: true, timeMultiplier: 1.5 },
      { readAloud: true, timeMultiplier: 1.5 },
    ]);
  });
});

const keyOf = (rosterId: string, studentId: string) => {
  const row = classStudentRows({
    rosters: SAMPLE_ROSTERS,
    selectedRosterIds: ['c1', 'c2'],
  }).find((r) => r.rosterId === rosterId && r.studentId === studentId);
  if (!row) throw new Error('no row');
  return row.key;
};

const EditHarness: React.FC<{
  saved: Record<string, StudentOverride>;
  savedClassIds?: string[];
  onSubmit: (extra: unknown) => void;
  studentsByClass?: AssignClassesValue['studentsByClass'];
}> = ({ saved, savedClassIds = ['c1'], onSubmit, studentsByClass = {} }) => {
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  const [classes, setClasses] = useState<AssignClassesValue>({
    classIds: savedClassIds,
    studentsByClass,
  });
  const auth = {
    canAccessFeature: (id: string) => id === 'quiz-read-aloud',
  } as unknown as React.ContextType<typeof AuthContext>;
  return (
    <AuthContext.Provider value={auth}>
      <QuizAssignStepper
        title="Unit 1 checkpoint"
        rosters={PRESET_ROSTERS}
        classes={classes}
        onClassesChange={(next) =>
          setClasses({ classIds: next.classIds, studentsByClass: {} })
        }
        when={defaultWhenValue({
          activity: 'quiz',
          bellAvailable: false,
          manualAvailable: false,
        })}
        onWhenChange={vi.fn()}
        behavior={getQuizAssignPrefill(null)}
        onBehaviorChange={vi.fn()}
        modifications={{
          targeting,
          onTargetingChange: setTargeting,
          quizContext: { questions: [], rubrics: [] },
        }}
        hasManualGrading={false}
        handRaiseMode="force-off"
        submitLabel="Save"
        onClose={vi.fn()}
        onSubmit={onSubmit}
        edit={{
          savedOverrides: saved,
          savedClassIds,
          servedLocales: [],
          when: { value: 'Manual', body: null },
        }}
      />
    </AuthContext.Provider>
  );
};

const stepTitles = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.textContent ?? '')
    .filter((text) => /^\d/.test(text))
    .map((text) => text.replace(/^\d/, ''));

describe('QuizAssignStepper editing a launched quiz', () => {
  const avery = keyOf('c1', 'a');
  const saved = { [avery]: { readAloud: true, closeAt: 99 } };
  const submitted = (onSubmit: ReturnType<typeof vi.fn>) =>
    (
      onSubmit.mock.calls[0]?.[0] as {
        overridesByKey: Record<string, StudentOverride>;
      }
    ).overridesByKey;

  it('lets the teacher change the students a class was narrowed to', () => {
    const row = classStudentRows({
      rosters: PRESET_ROSTERS,
      selectedRosterIds: ['c1'],
    }).find((r) => r.key === avery);
    if (!row) throw new Error('no row');
    render(
      <EditHarness
        saved={{}}
        onSubmit={vi.fn()}
        studentsByClass={{ c1: [row.ref] }}
      />
    );
    expect(screen.queryByTestId('picked-students-note')).toBeNull();
    expect(
      screen.getByRole('button', { name: /: 1 student$/ })
    ).toBeInTheDocument();
  });

  it('lists Modifications before Results, as assign does', () => {
    render(<EditHarness saved={saved} onSubmit={vi.fn()} />);
    const titles = stepTitles();
    const mods = titles.findIndex((t) => t.startsWith('Modifications'));
    expect(titles[mods - 1]).toMatch(/^Quiz integrity/);
    expect(titles[mods + 1]).toMatch(/^Results/);
  });

  it('opens on the saved rules, not the class presets', () => {
    render(<EditHarness saved={saved} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^\dModifications/ }));
    expect(screen.getByRole('switch', { name: 'Read aloud' })).toBeChecked();
    expect(screen.queryByText('Reading group A')).toBeNull();
    expect(screen.queryByText(/Priya/)).toBeNull();
  });

  it('hands back the saved overrides untouched when nothing changed', () => {
    const onSubmit = vi.fn();
    render(<EditHarness saved={saved} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submitted(onSubmit)).toEqual(saved);
  });

  it('keeps a student window when their group changes', () => {
    const onSubmit = vi.fn();
    render(<EditHarness saved={saved} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /^\dModifications/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'Read aloud' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submitted(onSubmit)[avery]).toEqual({ closeAt: 99 });
  });

  it('brings a newly checked class in with its presets', () => {
    const onSubmit = vi.fn();
    render(
      <EditHarness saved={{}} savedClassIds={['c2']} onSubmit={onSubmit} />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /^Sample 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(Object.values(submitted(onSubmit))).toEqual([
      { readAloud: true, timeMultiplier: 1.5 },
      { readAloud: true, timeMultiplier: 1.5 },
    ]);
  });
});

describe('QuizAssignStepper editing groups by rule', () => {
  it('puts students with the same rules in one group whatever their own window', () => {
    render(
      <EditHarness
        saved={{
          [keyOf('c1', 'a')]: { readAloud: true, closeAt: 5 },
          [keyOf('c1', 'c')]: { readAloud: true, questionIds: ['q1'] },
          [keyOf('c1', 'b')]: { closeAt: 7 },
        }}
        onSubmit={vi.fn()}
      />
    );
    const header = screen.getByRole('button', { name: /^\dModifications/ });
    expect(header.textContent).toMatch(/2 students: read aloud$/);
  });
});
