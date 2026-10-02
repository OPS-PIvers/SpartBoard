import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GuidedLearningConfigurationPanel } from './GuidedLearningConfigurationPanel';

describe('GuidedLearningConfigurationPanel', () => {
  it('shows Tour-safe when no policy is saved', () => {
    render(<GuidedLearningConfigurationPanel config={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Live tour Autopilot')).toHaveValue(
      'tour-safe'
    );
  });

  it('shows the saved policy and its help line', () => {
    render(
      <GuidedLearningConfigurationPanel
        config={{ tourAutopilotPolicy: 'confirm' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Live tour Autopilot')).toHaveValue('confirm');
    expect(screen.getByText(/asks before delete/)).toBeInTheDocument();
  });

  it('saves the chosen policy and keeps the rest of the config', () => {
    const onChange = vi.fn();
    render(
      <GuidedLearningConfigurationPanel
        config={{ dockDefaults: { a: true } }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Live tour Autopilot'), {
      target: { value: 'destructive-only' },
    });
    expect(onChange).toHaveBeenCalledWith({
      dockDefaults: { a: true },
      tourAutopilotPolicy: 'destructive-only',
    });
  });
});
