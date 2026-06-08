/**
 * AssignDestinationModal + SchoologyAssignInstructions — the Phase-2 library-row
 * Assign chooser and the Schoology how-to branch.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AssignDestinationModal,
  type AssignDestination,
} from '@/components/widgets/QuizWidget/components/AssignDestinationModal';
import { SchoologyAssignInstructions } from '@/components/widgets/QuizWidget/components/SchoologyAssignInstructions';

describe('AssignDestinationModal', () => {
  function renderChooser(opts: { showClassroom: boolean }) {
    const onPick = vi.fn<(d: AssignDestination) => void>();
    const onClose = vi.fn();
    render(
      <AssignDestinationModal
        quizTitle="Fractions Quiz"
        showClassroom={opts.showClassroom}
        onPick={onPick}
        onClose={onClose}
      />
    );
    return { onPick, onClose };
  }

  it('always offers SpartBoard Only and Schoology', () => {
    renderChooser({ showClassroom: false });
    expect(
      screen.getByRole('button', { name: /SpartBoard Only/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Schoology/i })
    ).toBeInTheDocument();
  });

  it('hides Google Classroom when not enabled, shows it when enabled', () => {
    const { onClose } = renderChooser({ showClassroom: false });
    expect(
      screen.queryByRole('button', { name: /Google Classroom/i })
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Re-render with the option enabled.
    renderChooser({ showClassroom: true });
    expect(
      screen.getByRole('button', { name: /Google Classroom/i })
    ).toBeInTheDocument();
  });

  it('calls onPick with the chosen destination', () => {
    const { onPick } = renderChooser({ showClassroom: true });
    fireEvent.click(screen.getByRole('button', { name: /SpartBoard Only/i }));
    expect(onPick).toHaveBeenCalledWith('spartboard');

    fireEvent.click(screen.getByRole('button', { name: /Google Classroom/i }));
    expect(onPick).toHaveBeenCalledWith('classroom');

    fireEvent.click(screen.getByRole('button', { name: /Schoology/i }));
    expect(onPick).toHaveBeenCalledWith('schoology');
  });

  it('shows the quiz title', () => {
    renderChooser({ showClassroom: true });
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
  });
});

describe('SchoologyAssignInstructions', () => {
  it('renders the numbered Add-Materials steps and closes on "Got it"', () => {
    const onClose = vi.fn();
    render(
      <SchoologyAssignInstructions
        quizTitle="Fractions Quiz"
        onClose={onClose}
      />
    );
    // Step copy references the key Schoology actions (appears in the diagram
    // and the numbered step).
    expect(screen.getAllByText(/Add Materials/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SpartBoard/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
