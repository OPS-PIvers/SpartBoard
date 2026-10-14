import React, { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  initialVersionPlan,
  type VersionPlan,
} from '@/utils/quizDocumentImport/versionPlan';
import type { ImportedTestSet } from '@/utils/quizDocumentImport/types';
import {
  importedFrq,
  importedMc,
} from '@/tests/utils/quizDocumentImport/versionFixtures';
import { QuizVersionReview } from './QuizVersionReview';

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

function Harness({
  set,
  onPlan,
}: {
  set: ImportedTestSet;
  onPlan?: (plan: VersionPlan) => void;
}) {
  const [plan, setPlan] = useState(() => initialVersionPlan(set));
  return (
    <QuizVersionReview
      set={set}
      plan={plan}
      onChange={(next) => {
        setPlan(next);
        onPlan?.(next);
      }}
    />
  );
}

describe('QuizVersionReview', () => {
  it('shows the versions found and the quizzes the AI proposed', async () => {
    render(<Harness set={await importedFrq()} />);
    expect(screen.getByText('6 versions found')).toBeInTheDocument();
    const names = screen
      .getAllByRole('textbox', { name: 'Quiz name' })
      .map((el) => (el as HTMLInputElement).value);
    expect(names).toEqual([
      'Unit 3 FRQ',
      'Unit 3 FRQ Retake',
      'Unit 3 FRQ Split',
    ]);
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', {
        name: 'How Unit 3 FRQ Split uses its versions',
      }).value
    ).toBe('split');
    expect(screen.getByText('Version A, Version B')).toBeInTheDocument();
  });

  it('lets the teacher move a version and rename or untick a quiz', async () => {
    const onPlan = vi.fn();
    render(<Harness set={await importedFrq()} onPlan={onPlan} />);
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Quiz for Unit 3 REASSESSMENT' }),
      { target: { value: 'new' } }
    );
    expect(screen.getAllByRole('textbox', { name: 'Quiz name' })).toHaveLength(
      4
    );
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Quiz name' })[0], {
      target: { value: 'Religion FRQ' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Create Religion FRQ' })
    );
    const last = onPlan.mock.calls.at(-1)?.[0] as VersionPlan;
    expect(last.groups[0]).toMatchObject({
      name: 'Religion FRQ',
      create: false,
    });
    expect(last.groups[1].versions).toEqual([2]);
  });

  it('shows each shared map as the same as Version A, and unlinks it', async () => {
    const set = await importedFrq();
    const onPlan = vi.fn();
    render(<Harness set={set} onPlan={onPlan} />);
    const row = screen.getByAltText('MAP #1 in Version B').closest('li');
    if (!row) throw new Error('no picture row');
    expect(within(row).getByText('Same as Version A')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Unlink' }));
    expect(
      within(row).getByText('Kept as its own picture')
    ).toBeInTheDocument();
    const [b1] = set.versions[1].questions[0].imageIds;
    expect(
      (onPlan.mock.calls.at(-1)?.[0] as VersionPlan).sharedImages[b1]
    ).toBe(undefined);
    fireEvent.click(within(row).getByRole('button', { name: 'Link' }));
    expect(within(row).getByText('Same as Version A')).toBeInTheDocument();
  });

  it('says a reordered MC version is a copy and offers one shuffled quiz', async () => {
    render(<Harness set={await importedMc()} />);
    expect(
      screen.getByText('Version B is Version A reordered.')
    ).toBeInTheDocument();
    const kind = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'How Unit 3 Quiz uses its versions',
    });
    expect(kind.value).toBe('duplicate');
    fireEvent.change(kind, { target: { value: 'parallel' } });
    expect(kind.value).toBe('parallel');
  });
});
