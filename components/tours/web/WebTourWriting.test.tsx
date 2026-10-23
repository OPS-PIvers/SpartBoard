import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React, { useRef, useState } from 'react';
import type { GuidedLearningSet } from '@/types';

const calls = vi.hoisted(() => ({
  request: vi.fn(),
}));
vi.mock('./writeWithClaude', async (orig) => ({
  ...(await orig<typeof import('./writeWithClaude')>()),
  requestWebTourWriting: calls.request,
}));
vi.mock('@/config/firebase', () => ({ functions: {} }));

import { WebStepClaudeFields, WebTourWriting } from './WebTourWriting';

const initial: GuidedLearningSet = {
  id: 't1',
  title: 'T',
  imageUrls: [],
  mode: 'tour',
  surface: 'web',
  createdAt: 1,
  updatedAt: 1,
  steps: [
    {
      id: 's1',
      xPct: 50,
      yPct: 50,
      imageIndex: 0,
      interactionType: 'tooltip',
      label: 'Click Gradebook',
      text: '',
      web: {
        urlPattern: 'https://lms.example/*',
        action: 'click',
        locator: { role: 'link', name: 'Gradebook' },
      },
    },
  ],
};

const Harness: React.FC<{ onFlush: (s: GuidedLearningSet) => void }> = ({
  onFlush,
}) => {
  const [set, setSet] = useState(initial);
  const latest = useRef(initial);
  const [status, setStatus] = useState('');
  const change = (fn: (s: GuidedLearningSet) => GuidedLearningSet) => {
    latest.current = fn(latest.current);
    setSet(latest.current);
  };
  return (
    <>
      <WebTourWriting
        set={set}
        change={change}
        flush={() => {
          onFlush(latest.current);
          return Promise.resolve(latest.current);
        }}
        onStatus={setStatus}
      />
      <WebStepClaudeFields
        step={set.steps[0]}
        onChange={(step) => change((cur) => ({ ...cur, steps: [step] }))}
      />
      <output data-testid="label">{set.steps[0].label}</output>
      <output data-testid="tip">{set.steps[0].text}</output>
      <p>{status}</p>
    </>
  );
};

describe('Write with Claude', () => {
  it('saves the goal and note first, fills the blanks, and undoes in one go', async () => {
    calls.request.mockResolvedValueOnce([
      { id: 's1', title: 'Open the gradebook', tip: 'Shows every grade.' },
    ]);
    const onFlush = vi.fn();
    render(<Harness onFlush={onFlush} />);
    fireEvent.change(screen.getByLabelText('What does your tour explain?'), {
      target: { value: 'Posting a grade' },
    });
    fireEvent.change(screen.getByLabelText('Note for Claude'), {
      target: { value: 'start of grading' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Write with Claude' }));
    await waitFor(() =>
      expect(screen.getByTestId('label')).toHaveTextContent(
        'Open the gradebook'
      )
    );
    const flushed = onFlush.mock.calls[0][0] as GuidedLearningSet;
    expect(flushed.webGoal).toBe('Posting a grade');
    expect(flushed.steps[0].web?.note).toBe('start of grading');
    expect(calls.request).toHaveBeenCalledWith('t1', [
      { id: 's1', fields: ['title', 'tip'] },
    ]);
    expect(screen.getByText('Claude wrote 1 step.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByTestId('label')).toHaveTextContent('Click Gradebook');
    expect(screen.getByTestId('tip')).toBeEmptyDOMElement();
  });

  it("shows Claude's question under the step and reruns just those steps", async () => {
    calls.request
      .mockResolvedValueOnce([{ id: 's1', question: 'Which course is this?' }])
      .mockResolvedValueOnce([{ id: 's1', tip: 'Opens grades.' }]);
    render(<Harness onFlush={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite all' }));
    expect(
      await screen.findByText('Which course is this?')
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Run again for questions' })
    );
    await waitFor(() =>
      expect(screen.getByTestId('tip')).toHaveTextContent('Opens grades.')
    );
    expect(calls.request).toHaveBeenLastCalledWith('t1', [
      { id: 's1', fields: ['title', 'tip'] },
    ]);
    expect(screen.queryByText('Which course is this?')).toBeNull();
  });
});
