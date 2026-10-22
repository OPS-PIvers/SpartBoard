import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ComposerSheet } from './ComposerSheet';
import {
  makeSession,
  makeSubmission,
} from '@/components/activityWall/render/fixtures';

vi.mock('@/config/firebase', () => ({ db: {}, storage: {}, auth: {} }));

const session = makeSession({ layout: 'timeline', timelineDates: true });

const renderSheet = (
  onSubmit = vi.fn(),
  editing?: ReturnType<typeof makeSubmission>
) => {
  render(
    <ComposerSheet
      session={session}
      editing={editing}
      onSubmit={onSubmit}
      onClose={vi.fn()}
      busy={false}
      progress={null}
      error={null}
    />
  );
  return onSubmit;
};

describe('ComposerSheet dated timeline', () => {
  it('needs a valid year and saves the formatted date as the label', () => {
    const onSubmit = renderSheet();
    fireEvent.change(screen.getByLabelText('Your response'), {
      target: { value: 'Rome' },
    });
    const post = screen.getByRole('button', { name: /post/i });
    expect(post).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Year'), {
      target: { value: '10000' },
    });
    expect(
      screen.getByText('Enter a year from 1 to 9,999.')
    ).toBeInTheDocument();
    expect(post).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Year'), {
      target: { value: '44' },
    });
    fireEvent.change(screen.getByLabelText('Era'), {
      target: { value: 'BCE' },
    });
    fireEvent.change(screen.getByLabelText('Month'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('Day'), {
      target: { value: '15' },
    });
    fireEvent.click(post);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'March 15, 44 BCE' }),
      expect.anything()
    );
  });

  it('saves an approximate date and turns off month and day', () => {
    const onSubmit = renderSheet();
    fireEvent.change(screen.getByLabelText('Your response'), {
      target: { value: 'Printing press' },
    });
    fireEvent.change(screen.getByLabelText('Year'), {
      target: { value: '1450' },
    });
    fireEvent.change(screen.getByLabelText('Accuracy'), {
      target: { value: 'about' },
    });
    expect(screen.getByLabelText('Month')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'c. 1450' }),
      expect.anything()
    );
  });

  it('starts an edit from the date already saved', () => {
    renderSheet(
      vi.fn(),
      makeSubmission({ label: 'June 6, 1944', content: 'D-Day' })
    );
    expect(screen.getByLabelText('Year')).toHaveValue('1944');
    expect(screen.getByLabelText('Month')).toHaveValue('6');
    expect(screen.getByLabelText('Day')).toHaveValue('6');
  });

  it('lets an older undated post be edited without adding a date', () => {
    const onSubmit = renderSheet(
      vi.fn(),
      makeSubmission({ label: 'Fall of Rome', content: 'Rome falls' })
    );
    fireEvent.change(screen.getByLabelText('Your response'), {
      target: { value: 'Rome falls in the west' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Fall of Rome' }),
      expect.anything()
    );
  });

  it('saves a range once an end date is added', () => {
    const onSubmit = renderSheet();
    fireEvent.change(screen.getByLabelText('Your response'), {
      target: { value: 'Civil War' },
    });
    fireEvent.change(screen.getByLabelText('Year'), {
      target: { value: '1861' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add end date' }));
    const endYear = screen.getAllByLabelText('Year')[1];
    fireEvent.change(endYear, { target: { value: '1860' } });
    expect(
      screen.getByText('End date must be after the start date.')
    ).toBeInTheDocument();
    fireEvent.change(endYear, { target: { value: '1865' } });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ label: '1861 – 1865' }),
      expect.anything()
    );
  });

  it('drops the end date when the start becomes approximate', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Add end date' }));
    expect(screen.getAllByLabelText('Year')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Accuracy'), {
      target: { value: 'about' },
    });
    expect(screen.getAllByLabelText('Year')).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Add end date' })
    ).not.toBeInTheDocument();
  });

  it('posts a single date when the end date is left blank', () => {
    const onSubmit = renderSheet();
    fireEvent.change(screen.getByLabelText('Your response'), {
      target: { value: 'Fort Sumter' },
    });
    fireEvent.change(screen.getByLabelText('Year'), {
      target: { value: '1861' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add end date' }));
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ label: '1861' }),
      expect.anything()
    );
  });

  it('places the post in the group the student picks', () => {
    const onSubmit = vi.fn();
    render(
      <ComposerSheet
        session={makeSession({
          layout: 'timeline',
          timelineDates: true,
          timelineGroups: [
            { id: 'dakota', label: 'Dakota' },
            { id: 'settlers', label: 'Settlers' },
          ],
        })}
        onSubmit={onSubmit}
        onClose={vi.fn()}
        busy={false}
        progress={null}
        error={null}
      />
    );
    fireEvent.change(screen.getByLabelText('Your response'), {
      target: { value: 'Treaty of Traverse des Sioux' },
    });
    fireEvent.change(screen.getByLabelText('Year'), {
      target: { value: '1851' },
    });
    expect(screen.getByLabelText('Group')).toHaveValue('dakota');
    fireEvent.change(screen.getByLabelText('Group'), {
      target: { value: 'settlers' },
    });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ label: '1851' }),
      expect.objectContaining({ sectionId: 'settlers' })
    );
  });

  it('shows no group picker on a timeline without groups', () => {
    renderSheet();
    expect(screen.queryByLabelText('Group')).not.toBeInTheDocument();
  });

  it('keeps an edited post out of every group until one is picked', () => {
    const onSubmit = vi.fn();
    render(
      <ComposerSheet
        session={makeSession({
          layout: 'timeline',
          timelineDates: true,
          timelineGroups: [{ id: 'dakota', label: 'Dakota' }],
        })}
        editing={makeSubmission({ id: 'old', label: '1851', content: 'Old' })}
        onSubmit={onSubmit}
        onClose={vi.fn()}
        busy={false}
        progress={null}
        error={null}
      />
    );
    expect(screen.getByLabelText('Group')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: /save|post/i }));
    const placement = onSubmit.mock.calls[0][1] as { sectionId?: string };
    expect(placement.sectionId).toBeUndefined();
  });
});
