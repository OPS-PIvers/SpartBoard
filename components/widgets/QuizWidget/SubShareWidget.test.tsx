import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { SubShareQuizWidget } from './SubShareWidget';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import type { WidgetData } from '@/types';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

// The preview is the teacher's own component; this suite is about which of it
// a substitute gets, not how it draws a question.
vi.mock('./components/QuizPreview', () => ({
  QuizPreview: ({
    quiz,
    onBack,
  }: {
    quiz: { title: string };
    onBack?: () => void;
  }) => (
    <div data-testid="quiz-preview" data-back={onBack ? 'yes' : 'no'}>
      {quiz.title}
    </div>
  ),
}));

// Launching has its own suite; here it only matters that the widget hands the
// panel the quiz and widget it is looking at.
vi.mock('@/components/subs/SubLaunchPanel', () => ({
  SubLaunchPanel: ({
    kind,
    widgetId,
    itemId,
  }: {
    kind: string;
    widgetId: string;
    itemId?: string | null;
  }) => (
    <div data-testid="sub-launch" data-kind={kind} data-widget={widgetId}>
      {itemId}
    </div>
  ),
}));

const widget = (config: Record<string, unknown>) =>
  ({ id: 'w1', type: 'quiz', config }) as unknown as WidgetData;

const inShare = (
  loadKey: () => Promise<{ payload: unknown; denied: boolean }>
) =>
  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({
          shareId: 'share-1',
          version: 0,
          load: (() => Promise.resolve(null)) as never,
          loadKey,
        })}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  };

const bundled = (title: string) => () =>
  Promise.resolve({
    payload: { quiz: { id: 'q-1', title, questions: [] } },
    denied: false,
  });

describe('SubShareQuizWidget', () => {
  it('shows the quiz the teacher had open, with no way back to a library', async () => {
    render(
      <SubShareQuizWidget
        widget={widget({ selectedQuizId: 'q-1', selectedQuizTitle: 'Cells' })}
      />,
      { wrapper: inShare(bundled('Cells')) }
    );

    const preview = await screen.findByTestId('quiz-preview');
    expect(preview).toHaveTextContent('Cells');
    expect(preview).toHaveAttribute('data-back', 'no');
  });

  it('offers to launch the quiz it is showing', async () => {
    render(
      <SubShareQuizWidget
        widget={widget({ selectedQuizId: 'q-1', selectedQuizTitle: 'Cells' })}
      />,
      { wrapper: inShare(bundled('Cells')) }
    );

    const panel = await screen.findByTestId('sub-launch');
    expect(panel).toHaveAttribute('data-kind', 'quiz');
    expect(panel).toHaveAttribute('data-widget', 'w1');
    expect(panel).toHaveTextContent('q-1');
  });

  // Nothing on screen to start, so nothing to start it with.
  it('offers no launch when the quiz did not come along', async () => {
    render(
      <SubShareQuizWidget
        widget={widget({ selectedQuizId: 'q-1', selectedQuizTitle: 'Cells' })}
      />,
      {
        wrapper: inShare(() =>
          Promise.resolve({ payload: null, denied: false })
        ),
      }
    );

    expect(await screen.findByText('No quiz')).toBeInTheDocument();
    expect(screen.queryByTestId('sub-launch')).not.toBeInTheDocument();
  });

  // The share's keys are readable only by the subs it names; anyone else with
  // the link should be told that, not told the teacher forgot the quiz.
  it('says so when the share does not name this reader', async () => {
    render(
      <SubShareQuizWidget
        widget={widget({ selectedQuizId: 'q-1', selectedQuizTitle: 'Cells' })}
      />,
      {
        wrapper: inShare(() =>
          Promise.resolve({ payload: null, denied: true })
        ),
      }
    );

    expect(await screen.findByText('Not shared with you')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cells is only for the substitutes your teacher named on the share.'
      )
    ).toBeInTheDocument();
  });

  it('names the quiz that did not come along', async () => {
    render(
      <SubShareQuizWidget
        widget={widget({ selectedQuizId: 'q-1', selectedQuizTitle: 'Cells' })}
      />,
      {
        wrapper: inShare(() =>
          Promise.resolve({ payload: null, denied: false })
        ),
      }
    );

    expect(await screen.findByText('No quiz')).toBeInTheDocument();
    expect(
      screen.getByText('Cells did not come along with the share.')
    ).toBeInTheDocument();
  });

  it('reads nothing when the widget had no quiz open', () => {
    const loadKey = vi.fn();
    render(<SubShareQuizWidget widget={widget({ selectedQuizId: null })} />, {
      wrapper: inShare(loadKey as never),
    });

    expect(loadKey).not.toHaveBeenCalled();
    expect(screen.getByText('No quiz')).toBeInTheDocument();
  });
});
