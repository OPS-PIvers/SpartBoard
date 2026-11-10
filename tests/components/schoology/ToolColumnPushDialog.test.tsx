import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ functions: {} }));
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock('@/utils/schoologyToolColumns', () => ({
  createToolColumnCategories: createMock,
}));

import { ToolColumnPushDialog } from '@/components/schoology/ToolColumnPushDialog';
import type { ToolColumnCategoriesData } from '@/utils/schoologyToolColumns';

const CATS = [
  { id: '1', title: 'Academic Practice', weight: 20 },
  { id: '2', title: 'Academic Achievement', weight: 80 },
];

const data = (
  sections: Partial<ToolColumnCategoriesData['sections'][number]>[]
): ToolColumnCategoriesData => ({
  sections: sections.map((s, i) => ({
    contextId: String(100 + i),
    title: `Section ${i + 1}`,
    hasColumn: false,
    needsCategory: true,
    categories: CATS,
    defaultCategoryId: null,
    ...s,
  })),
  recommended: [
    { title: 'Academic Practice', weight: 20 },
    { title: 'Academic Achievement', weight: 80 },
  ],
});

const onConfirm = vi.fn();
const renderDialog = (
  d: ToolColumnCategoriesData,
  missingCount = 0,
  initialDueDate?: string
) =>
  render(
    <ToolColumnPushDialog
      data={d}
      sessionId="S1"
      kind="quiz"
      title="Cells quiz"
      missingCount={missingCount}
      initialDueDate={initialDueDate}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />
  );

beforeEach(() => {
  onConfirm.mockReset();
  createMock.mockReset();
});

describe('ToolColumnPushDialog', () => {
  it('requires a category per new column, preselecting the last choice', () => {
    renderDialog(data([{}, { defaultCategoryId: '2' }]), 3);
    expect(
      screen.getByText(/adds a “Cells quiz” column to 2 Schoology sections/)
    ).toBeTruthy();
    expect(screen.getByText(/3 students with no submission/)).toBeTruthy();
    const push = screen.getByRole('button', { name: 'Push' });
    expect(push).toBeDisabled();
    expect(screen.getByLabelText('Category for Section 2')).toHaveValue('2');
    fireEvent.change(screen.getByLabelText('Category for Section 1'), {
      target: { value: '1' },
    });
    fireEvent.click(push);
    expect(onConfirm).toHaveBeenCalledWith({ '100': '1', '101': '2' }, null);
  });

  it('offers to create categories, then asks for a pick and warns when weighting is off', async () => {
    createMock.mockResolvedValue({
      categories: CATS.map((c) => ({ ...c, weight: 0 })),
      weightingOff: true,
    });
    renderDialog(data([{ categories: [] }]));
    expect(screen.getByText(/no grading categories/)).toBeTruthy();
    expect(screen.getByLabelText('Category 1 name')).toHaveValue(
      'Academic Practice'
    );
    fireEvent.change(screen.getByLabelText('Category 1 weight'), {
      target: { value: '30' },
    });
    expect(screen.getByText('Total 110%')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Create categories' })
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Category 2 weight'), {
      target: { value: '70' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create categories' }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        {},
        {
          sessionId: 'S1',
          kind: 'quiz',
          contextId: '100',
          categories: [
            { title: 'Academic Practice', weight: 30 },
            { title: 'Academic Achievement', weight: 70 },
          ],
        }
      )
    );
    expect(await screen.findByText(/Turn on weighted categories/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Category for Section 1'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Push' }));
    expect(onConfirm).toHaveBeenCalledWith({ '100': '2' }, null);
  });

  it('lets the teacher skip a course with no categories', () => {
    renderDialog(data([{ categories: [] }]));
    expect(screen.getByRole('button', { name: 'Push' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Skip this course' }));
    fireEvent.click(screen.getByRole('button', { name: 'Push' }));
    expect(onConfirm).toHaveBeenCalledWith({}, null);
  });

  it('pushes without a pick when categories could not be read', () => {
    renderDialog(data([{ categories: null, needsCategory: false }]));
    fireEvent.click(screen.getByRole('button', { name: 'Push' }));
    expect(onConfirm).toHaveBeenCalledWith({}, null);
  });

  it('sends the due date the teacher picks for a new column', () => {
    renderDialog(
      data([{ categories: null, needsCategory: false }]),
      0,
      '2026-11-10'
    );
    const due = screen.getByLabelText('Due date');
    expect(due).toHaveValue('2026-11-10');
    fireEvent.change(due, { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Push' }));
    expect(onConfirm).toHaveBeenCalledWith({}, '2026-11-14');
  });

  it('hides the due date when the flag is off or no column is new', () => {
    const { unmount } = renderDialog(
      data([{ categories: null, needsCategory: false }])
    );
    expect(screen.queryByLabelText('Due date')).toBeNull();
    unmount();
    renderDialog(
      data([{ hasColumn: true, defaultCategoryId: '1' }]),
      0,
      '2026-11-10'
    );
    expect(screen.queryByLabelText('Due date')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Push' }));
    expect(onConfirm).toHaveBeenCalledWith({ '100': '1' }, null);
  });
});
