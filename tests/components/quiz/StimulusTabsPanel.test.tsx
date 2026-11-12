import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { StimulusTabsPanel } from '@/components/quiz/StimulusTabsPanel';
import type { QuizStimulus } from '@/types';

const stim = (id: string, extra: Partial<QuizStimulus> = {}): QuizStimulus => ({
  id,
  type: 'text',
  url: '',
  label: '',
  ...extra,
});

const renderBody = (s: QuizStimulus) => <p>Body {s.id}</p>;

describe('StimulusTabsPanel', () => {
  it('shows one stimulus with no tabs', () => {
    render(
      <StimulusTabsPanel
        stimuli={[stim('a')]}
        light
        renderStimulus={renderBody}
      />
    );
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Body a')).toBeVisible();
  });

  it('opens the first tab and switches by click and arrow key', async () => {
    const user = userEvent.setup();
    render(
      <StimulusTabsPanel
        stimuli={[
          stim('a', { tabLabel: 'Source A' }),
          stim('b'),
          stim('c', { type: 'calculator' }),
        ]}
        light
        renderStimulus={renderBody}
      />
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Source A',
      'Tab 2',
      'Calculator',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Body a')).toBeVisible();
    expect(screen.getByText('Body b')).not.toBeVisible();

    await user.click(tabs[1]);
    expect(screen.getByText('Body b')).toBeVisible();
    expect(screen.getByText('Body a')).not.toBeVisible();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Calculator' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
