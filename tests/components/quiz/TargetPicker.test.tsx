import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { StandardBenchmark } from '@/types';
import { TargetPicker } from '@/components/quiz/targets/TargetPicker';

const authState = {
  effectiveGrades: ['9', '10', '11', '12'] as string[],
  subjectsTaught: ['ela'] as string[],
};
vi.mock('@/context/useAuth', () => ({ useAuth: () => authState }));

const bench = (
  code: string,
  grade: string,
  strand: string,
  standard: string,
  text: string,
  subject: 'ela' | 'social-studies' = 'ela'
): StandardBenchmark => ({
  id: `${subject}:${code}`,
  set: subject === 'ela' ? 'mn-ela-2020' : 'mn-ss-2021',
  subject,
  code,
  grade,
  strand,
  standard,
  text,
  searchText: `${code} ${text}`.toLowerCase(),
});

const catalog = [
  bench('6.1.9.1', '6', 'Reading', 'R9 Media Literacy: Read.', 'Analyze ads'),
  bench(
    '9.1.9.1',
    '9-12',
    'Reading',
    'R9 Media Literacy: Read.',
    'Evaluate sources'
  ),
  bench('9.2.1.1', '9-12', 'Writing', 'W1 Argument: Write.', 'Write claims'),
  bench(
    '7.1.5.1',
    '7',
    '1. Citizenship',
    '5. Public Policy: Explain.',
    'Explain policy',
    'social-studies'
  ),
];

vi.mock('@/hooks/useStandardsCatalog', () => ({
  useStandardsCatalog: () => ({
    benchmarks: catalog,
    loading: false,
    error: null,
  }),
}));

const sources = [
  {
    kind: 'personal',
    name: 'My learning targets',
    list: {
      targets: [
        {
          id: 'lt-any',
          label: 'Everywhere target',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'lt-6',
          label: 'Grade 6 target',
          grades: ['6'],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'lt-ss',
          label: 'Civics target',
          standardIds: ['social-studies:7.1.5.1'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      updatedAt: 1,
    },
  },
];
vi.mock('@/hooks/useLearningTargets', () => ({
  useLearningTargetSources: () => ({ sources, loading: false }),
}));

vi.mock('@/hooks/useSubjects', () => ({
  useSubjects: () => ({
    subjects: [],
    active: [],
    byId: new Map([
      ['ela', { id: 'ela', label: 'English Language Arts' }],
      ['social-studies', { id: 'social-studies', label: 'Social Studies' }],
    ]),
    loading: false,
  }),
}));

describe('TargetPicker', () => {
  const onApply = vi.fn();
  beforeEach(() => {
    onApply.mockClear();
    authState.effectiveGrades = ['9', '10', '11', '12'];
    authState.subjectsTaught = ['ela'];
  });

  const renderPicker = (
    props: Partial<React.ComponentProps<typeof TargetPicker>> = {}
  ) =>
    render(
      <TargetPicker
        open
        initial={[]}
        onApply={onApply}
        onClose={vi.fn()}
        {...props}
      />
    );

  it('opens on the only taught subject with profile grades and hides other grades', () => {
    renderPicker();
    expect(screen.getByRole('combobox', { name: 'Content area' })).toHaveValue(
      'ela'
    );
    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // Strands open, standards collapsed: R9 and W1 visible, benchmarks hidden.
    expect(screen.getByText('R9')).toBeInTheDocument();
    expect(screen.getByText('W1')).toBeInTheDocument();
    expect(screen.queryByText('Analyze ads')).toBeNull();
    expect(screen.queryByText('Evaluate sources')).toBeNull();
    // Social Studies is filtered out by subject.
    expect(screen.queryByText('Public Policy')).toBeNull();
  });

  it('expands a standard to its grade-visible benchmarks and selects at either level', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Expand R9' }));
    expect(screen.getByText('Evaluate sources')).toBeInTheDocument();
    expect(screen.queryByText('Analyze ads')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: /Media Literacy/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Evaluate sources/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const tags = onApply.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(tags).toEqual([
      expect.objectContaining({
        id: 'mn-ela-2020:std:R9',
        kind: 'standard',
        code: 'R9',
        label: 'Media Literacy',
      }),
      expect.objectContaining({
        id: 'ela:9.1.9.1',
        code: '9.1.9.1',
        parentId: 'mn-ela-2020:std:R9',
        parentLabel: 'Media Literacy',
      }),
    ]);
  });

  it('"All grades" and the subject dropdown widen the tree; search keeps the tree shape', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'All grades' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Content area' }), {
      target: { value: 'all' },
    });
    expect(
      screen.getByRole('heading', { name: 'Social Studies' })
    ).toBeInTheDocument();
    expect(screen.getByText('Public Policy')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search by code or text'), {
      target: { value: 'analyze' },
    });
    // Matching benchmark shown under its auto-expanded standard; others gone.
    expect(screen.getByText('Analyze ads')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.queryByText('W1')).toBeNull();
    expect(screen.queryByText('Public Policy')).toBeNull();
  });

  it('filters targets by effective grade and subject but always shows unfilterable ones', () => {
    renderPicker();
    const mine = screen.getByRole('heading', { name: 'My targets' })
      .parentElement as HTMLElement;
    expect(within(mine).getByText('Everywhere target')).toBeInTheDocument();
    expect(within(mine).queryByText('Grade 6 target')).toBeNull();
    expect(within(mine).queryByText('Civics target')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All grades' }));
    expect(within(mine).getByText('Grade 6 target')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Content area' }), {
      target: { value: 'social-studies' },
    });
    expect(within(mine).getByText('Civics target')).toBeInTheDocument();
    expect(within(mine).queryByText('Grade 6 target')).toBeInTheDocument();
  });

  it('shows every content area when the profile lists none or several', () => {
    authState.subjectsTaught = [];
    renderPicker();
    expect(screen.getByRole('combobox', { name: 'Content area' })).toHaveValue(
      'all'
    );
    expect(
      screen.getByRole('heading', { name: 'English Language Arts' })
    ).toBeInTheDocument();
  });
});
