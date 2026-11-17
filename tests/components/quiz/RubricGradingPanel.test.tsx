import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { RubricScoringPanel } from '@/components/widgets/QuizWidget/components/RubricScoringPanel';
import { AuthContext } from '@/context/AuthContextValue';
import { mockAuth } from '@/components/student/studentMocks';
import type { AuthContextType } from '@/context/AuthContextValue';
import type {
  Rubric,
  RubricLevelOrder,
  WrittenAnswerRubricScore,
} from '@/types';

const rubric: Rubric = {
  id: 'r1',
  title: 'Essay rubric',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'c1',
      name: 'Thesis',
      description: 'Clarity of the claim',
      levels: [
        { id: 'c1l1', label: 'Below', points: 1, description: 'No thesis' },
        { id: 'c1l2', label: 'Meets', points: 3 },
        { id: 'c1l3', label: 'Exceeds', points: 4 },
      ],
    },
    {
      id: 'c2',
      name: 'Evidence',
      levels: [
        { id: 'c2l1', label: 'Below', points: 1 },
        { id: 'c2l2', label: 'Meets', points: 2 },
      ],
    },
  ],
};

let renders = 0;

const renderPanel = (
  opts: {
    flag?: boolean;
    order?: RubricLevelOrder;
    updateAccountPreferences?: AuthContextType['updateAccountPreferences'];
  } = {}
) => {
  const onChange = vi.fn<(s: WrittenAnswerRubricScore[], p: number) => void>();
  const auth: AuthContextType = {
    ...mockAuth,
    canAccessFeature: (id) =>
      id === 'rubric-grading-v2' ? opts.flag !== false : true,
    rubricLevelOrder: opts.order ?? 'high-first',
    updateAccountPreferences:
      opts.updateAccountPreferences ?? vi.fn().mockResolvedValue(undefined),
  };
  render(
    <AuthContext.Provider value={auth}>
      <RubricScoringPanel
        rubric={{ ...rubric, id: `r${++renders}` }}
        maxPoints={6}
        onChange={onChange}
      />
    </AuthContext.Provider>
  );
  return { onChange };
};

const openCriterion = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));

const levelButtons = (criterionName: string) =>
  within(
    screen.getByRole('group', { name: new RegExp(criterionName) })
  ).getAllByRole('button', { pressed: false });

describe('RubricGradingPanel (rubric-grading-v2)', () => {
  it('keeps the legacy radio panel when the flag is off', () => {
    renderPanel({ flag: false });
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /View rubric/ })).toBeNull();
  });

  it('shows collapsed point buttons, highest first by default', () => {
    renderPanel();
    expect(levelButtons('Thesis').map((b) => b.textContent)).toEqual([
      '4',
      '3',
      '1',
    ]);
  });

  it('shows lowest first when the teacher prefers it', () => {
    renderPanel({ order: 'low-first' });
    expect(levelButtons('Thesis').map((b) => b.textContent)).toEqual([
      '1',
      '3',
      '4',
    ]);
  });

  it('saves the order switch to the teacher preferences', () => {
    const updateAccountPreferences = vi.fn().mockResolvedValue(undefined);
    renderPanel({ updateAccountPreferences });
    fireEvent.click(screen.getByRole('button', { name: /Level order/ }));
    expect(updateAccountPreferences).toHaveBeenCalledWith({
      rubricLevelOrder: 'low-first',
    });
  });

  it('selects a level, then deselects it on a second tap', () => {
    const { onChange } = renderPanel();
    const meets = screen.getByRole('button', { name: 'Meets, 3 pts' });
    fireEvent.click(meets);
    expect(onChange).toHaveBeenLastCalledWith(
      [{ criterionId: 'c1', levelId: 'c1l2', points: 3 }],
      3
    );
    expect(meets).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(meets);
    expect(onChange).toHaveBeenLastCalledWith([], 0);
    expect(meets).toHaveAttribute('aria-pressed', 'false');
  });

  it('expands a criterion to show its description and level descriptions', () => {
    renderPanel();
    expect(screen.queryByText('Clarity of the claim')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Thesis/ }));
    expect(screen.getByText('Clarity of the claim')).toBeInTheDocument();
    expect(screen.getByText('No thesis')).toBeInTheDocument();
  });

  it('takes a score override in the criterion box and keeps the level', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Meets, 3 pts' }));
    openCriterion('Thesis');
    fireEvent.change(screen.getByLabelText('Score for Thesis'), {
      target: { value: '2.5' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      [{ criterionId: 'c1', levelId: 'c1l2', points: 2.5 }],
      2.5
    );
  });

  it('picks the matching level when a typed score equals one', () => {
    const { onChange } = renderPanel();
    openCriterion('Thesis');
    fireEvent.change(screen.getByLabelText('Score for Thesis'), {
      target: { value: '4' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      [{ criterionId: 'c1', levelId: 'c1l3', points: 4 }],
      4
    );
  });

  it('scores with no level when the typed score matches none', () => {
    const { onChange } = renderPanel();
    openCriterion('Evidence');
    fireEvent.change(screen.getByLabelText('Score for Evidence'), {
      target: { value: '1.5' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      [{ criterionId: 'c2', levelId: '', points: 1.5 }],
      1.5
    );
  });

  it('ignores a score above the criterion max', () => {
    const { onChange } = renderPanel();
    openCriterion('Evidence');
    const box = screen.getByLabelText('Score for Evidence');
    fireEvent.change(box, { target: { value: '9' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveAttribute('aria-invalid', 'true');
  });

  it('opens the full rubric as a table', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /View rubric/ }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(
      within(table).getByRole('rowheader', { name: /Thesis/ })
    ).toBeInTheDocument();
  });
});

describe('applyRubricEdit', () => {
  it('swaps the rubric into matching questions and resets their points', async () => {
    const { applyRubricEdit } = await import('@/utils/rubricPoints');
    const edited = {
      ...rubric,
      criteria: rubric.criteria.map((c) =>
        c.id === 'c2'
          ? {
              ...c,
              levels: [...c.levels, { id: 'c2l3', label: 'Top', points: 5 }],
            }
          : c
      ),
    };
    const out = applyRubricEdit(
      [
        { id: 'q1', rubricId: 'lib1', rubricSnapshot: rubric, points: 6 },
        { id: 'q2', points: 3 },
      ],
      edited
    );
    expect(out.changed).toBe(true);
    expect(out.libraryIds).toEqual(['lib1']);
    expect(out.questions[0]).toMatchObject({
      rubricSnapshot: edited,
      points: 9,
    });
    expect(out.questions[1]).toEqual({ id: 'q2', points: 3 });
  });
});

describe('Full rubric table editing', () => {
  it('edits a level description and saves the rubric', async () => {
    const onSave = vi
      .fn<(r: Rubric) => Promise<void>>()
      .mockResolvedValue(undefined);
    const { RubricTableModal } =
      await import('@/components/widgets/QuizWidget/components/RubricTableModal');
    render(
      <RubricTableModal
        rubric={rubric}
        order="high-first"
        onOrderChange={vi.fn()}
        scores={new Map()}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    fireEvent.change(screen.getByLabelText('Criterion 1 name'), {
      target: { value: 'Claim' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].criteria[0].name).toBe('Claim');
  });

  it('blocks saving when two levels share points', async () => {
    const { RubricTableModal } =
      await import('@/components/widgets/QuizWidget/components/RubricTableModal');
    render(
      <RubricTableModal
        rubric={rubric}
        order="high-first"
        onOrderChange={vi.fn()}
        scores={new Map()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    fireEvent.change(screen.getByLabelText('Criterion 2 level 1 points'), {
      target: { value: '1' },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('adds and removes criteria and levels in the builder table', async () => {
    const onSave = vi
      .fn<(r: Rubric) => Promise<void>>()
      .mockResolvedValue(undefined);
    const onClose = vi.fn();
    const shared: Rubric = {
      ...rubric,
      criteria: rubric.criteria.map((c) => ({
        ...c,
        levels: c.levels.slice(0, 2).map((l, i) => ({
          ...l,
          label: i ? 'Meets' : 'Below',
        })),
      })),
    };
    const { RubricTableModal } =
      await import('@/components/widgets/QuizWidget/components/RubricTableModal');
    render(
      <RubricTableModal
        rubric={shared}
        order="high-first"
        onOrderChange={vi.fn()}
        scores={new Map()}
        onClose={onClose}
        onSave={onSave}
        initialEditing
        editStructure
        saveLabel="Done"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add level' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove criterion 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.criteria.map((c) => c.levels.length)).toEqual([3, 3]);
    expect(saved.criteria[1].levels.map((l) => l.label)).toEqual([
      'Below',
      'Meets',
      '',
    ]);
  });
});
