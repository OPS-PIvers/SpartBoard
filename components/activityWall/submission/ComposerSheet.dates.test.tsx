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

  it('starts an edit from the date already saved', () => {
    renderSheet(
      vi.fn(),
      makeSubmission({ label: 'June 6, 1944', content: 'D-Day' })
    );
    expect(screen.getByLabelText('Year')).toHaveValue('1944');
    expect(screen.getByLabelText('Month')).toHaveValue('6');
    expect(screen.getByLabelText('Day')).toHaveValue('6');
  });
});
