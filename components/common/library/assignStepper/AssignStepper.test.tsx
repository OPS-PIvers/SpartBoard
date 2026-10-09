import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssignStepper } from './AssignStepper';
import type { AssignStepDef } from './assignSteps';

const STEPS: AssignStepDef[] = [
  {
    id: 'classes',
    title: 'Classes',
    value: 'All 3 classes',
    body: <p>classes body</p>,
  },
  { id: 'when', title: 'When', value: 'Manual', body: <p>when body</p> },
  {
    id: 'feedback',
    title: 'What students see',
    value: 'Their score',
    body: <p>feedback body</p>,
  },
];

const renderStepper = (
  props: Partial<React.ComponentProps<typeof AssignStepper>> = {}
) => {
  const onSubmit = vi.fn();
  const utils = render(
    <AssignStepper
      isOpen
      onClose={vi.fn()}
      title="Sample Quiz"
      steps={STEPS}
      submitLabel="Assign"
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { ...utils, onSubmit };
};

const header = (name: string) =>
  screen.getByRole('button', { name: new RegExp(name) });

describe('AssignStepper', () => {
  it('opens the first step and shows the others closed with their values', () => {
    renderStepper();
    expect(screen.getByText('classes body')).toBeInTheDocument();
    expect(screen.queryByText('when body')).not.toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(header('Classes')).toHaveAttribute('aria-expanded', 'true');
  });

  it('moves to the next step on Continue and has no Continue on the last step', () => {
    renderStepper();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByText('when body')).toBeInTheDocument();
    expect(screen.queryByText('classes body')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByText('feedback body')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Continue/ })
    ).not.toBeInTheDocument();
  });

  it('opens any step from its header', () => {
    renderStepper();
    fireEvent.click(header('What students see'));
    expect(screen.getByText('feedback body')).toBeInTheDocument();
    expect(screen.queryByText('classes body')).not.toBeInTheDocument();
  });

  it('submits from any step', async () => {
    const { onSubmit } = renderStepper();
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    fireEvent.click(header('When'));
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });

  it('does not submit while disabled or submitting', () => {
    const { onSubmit, rerender } = renderStepper({ disabled: true });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    rerender(
      <AssignStepper
        isOpen
        onClose={vi.fn()}
        title="Sample Quiz"
        steps={STEPS}
        submitLabel="Assign"
        onSubmit={onSubmit}
        submitting
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the last step open when the step list shrinks', () => {
    const { rerender, onSubmit } = renderStepper();
    fireEvent.click(header('What students see'));
    rerender(
      <AssignStepper
        isOpen
        onClose={vi.fn()}
        title="Sample Quiz"
        steps={STEPS.slice(0, 2)}
        submitLabel="Assign"
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByText('when body')).toBeInTheDocument();
  });

  it('shows the overlay view in place of the steps', () => {
    renderStepper({ overlayView: <p>modifications view</p> });
    expect(screen.getByText('modifications view')).toBeInTheDocument();
    expect(screen.queryByText('classes body')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Assign' })
    ).not.toBeInTheDocument();
  });

  it('reopens on the first step', () => {
    const { rerender, onSubmit } = renderStepper();
    fireEvent.click(header('When'));
    const props = {
      onClose: vi.fn(),
      title: 'Sample Quiz',
      steps: STEPS,
      submitLabel: 'Assign',
      onSubmit,
    };
    rerender(<AssignStepper isOpen={false} {...props} />);
    rerender(<AssignStepper isOpen {...props} />);
    expect(screen.getByText('classes body')).toBeInTheDocument();
  });
});
