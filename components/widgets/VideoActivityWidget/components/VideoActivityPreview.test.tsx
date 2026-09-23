import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { VideoActivityPreview } from './VideoActivityPreview';
import type { SubShareVideoActivityView, VideoActivityQuestion } from '@/types';

const question = (
  fields: Partial<VideoActivityQuestion> & { id: string }
): VideoActivityQuestion =>
  ({
    text: 'Which phase?',
    type: 'MC',
    timestamp: 0,
    ...fields,
  }) as VideoActivityQuestion;

const activity = (
  questions: VideoActivityQuestion[],
  youtubeUrl = 'https://youtu.be/dQw4w9WgXcQ'
): SubShareVideoActivityView => ({
  id: 'va-1',
  title: 'Cell division',
  youtubeUrl,
  questions,
  createdAt: 1,
  updatedAt: 2,
});

describe('VideoActivityPreview', () => {
  it('embeds the video the teacher chose', () => {
    const { container } = render(
      <VideoActivityPreview activity={activity([])} />
    );

    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0'
    );
  });

  // A sub cannot launch the activity, so the questions are only useful to them
  // with the answers beside them.
  it('lists each question at its timestamp with the answer', () => {
    render(
      <VideoActivityPreview
        activity={activity([
          question({ id: 'q1', timestamp: 75, correctAnswer: 'Anaphase' }),
        ])}
      />
    );

    expect(screen.getByText('1:15')).toBeInTheDocument();
    expect(screen.getByText('1. Which phase?')).toBeInTheDocument();
    expect(screen.getByText('Anaphase')).toBeInTheDocument();
  });

  it('puts the questions in video order, not storage order', () => {
    render(
      <VideoActivityPreview
        activity={activity([
          question({ id: 'late', timestamp: 120, text: 'Second' }),
          question({ id: 'early', timestamp: 10, text: 'First' }),
        ])}
      />
    );

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('First');
    expect(items[1]).toHaveTextContent('Second');
  });

  // MA keys are `|`-encoded and FIB carries variants; both have to read as
  // separate accepted answers, not as one string with a pipe in it.
  it('splits a multiple-answer key into its selections', () => {
    render(
      <VideoActivityPreview
        activity={activity([
          question({ id: 'q1', type: 'MA', correctAnswer: 'DNA|RNA' }),
        ])}
      />
    );

    expect(screen.getByText('DNA')).toBeInTheDocument();
    expect(screen.getByText('RNA')).toBeInTheDocument();
    expect(screen.queryByText('DNA|RNA')).not.toBeInTheDocument();
  });

  it('shows a fill-in-the-blank’s accepted variants too', () => {
    render(
      <VideoActivityPreview
        activity={activity([
          question({
            id: 'q1',
            type: 'FIB',
            correctAnswer: 'mitosis',
            acceptableVariants: ['Mitosis ', ''],
          }),
        ])}
      />
    );

    expect(screen.getByText('mitosis')).toBeInTheDocument();
    expect(screen.getByText('Mitosis')).toBeInTheDocument();
  });

  it('says when a question has no answer saved', () => {
    render(
      <VideoActivityPreview
        activity={activity([question({ id: 'q1', correctAnswer: '' })])}
      />
    );

    expect(screen.getByText('No answer saved')).toBeInTheDocument();
  });

  it('says when the video could not be read', () => {
    render(<VideoActivityPreview activity={activity([], 'not-a-video')} />);

    expect(
      screen.getByText('The video for this activity could not be read.')
    ).toBeInTheDocument();
  });

  it('says when the activity has no questions', () => {
    render(<VideoActivityPreview activity={activity([])} />);

    expect(
      screen.getByText('This activity has no questions.')
    ).toBeInTheDocument();
  });
});
