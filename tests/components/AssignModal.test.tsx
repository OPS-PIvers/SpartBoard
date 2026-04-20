import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssignModal } from '@/components/common/library/AssignModal';
import type { AssignModeOption } from '@/components/common/library/types';

interface MiniAppOptions {
  allowRedo: boolean;
}

interface QuizOptions {
  speedBonusEnabled: boolean;
}

const MODES: AssignModeOption[] = [
  {
    id: 'teacher',
    label: 'Teacher-paced',
    description: 'You control when to move.',
  },
  {
    id: 'auto',
    label: 'Auto-progress',
    description: 'Moves when everyone answers.',
  },
  {
    id: 'student',
    label: 'Self-paced',
    description: 'Students progress themselves.',
  },
];

describe('AssignModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without modes (MiniApp shape)', () => {
    render(
      <AssignModal<MiniAppOptions>
        isOpen
        onClose={vi.fn()}
        itemTitle="Test Mini-App"
        options={{ allowRedo: true }}
        onOptionsChange={vi.fn()}
        onAssign={vi.fn()}
      />
    );
    expect(screen.getByText('Test Mini-App')).toBeInTheDocument();
    // No mode selector
    expect(screen.queryByText('Session Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Teacher-paced')).not.toBeInTheDocument();
    // No assignment name input when not provided
    expect(screen.queryByLabelText('Assignment Name')).not.toBeInTheDocument();
    // Assign button exists
    expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
  });

  it('renders with modes (Quiz shape) and reflects selected mode', () => {
    const onModeChange = vi.fn();
    render(
      <AssignModal<QuizOptions>
        isOpen
        onClose={vi.fn()}
        itemTitle="Test Quiz"
        modes={MODES}
        selectedMode="teacher"
        onModeChange={onModeChange}
        options={{ speedBonusEnabled: false }}
        onOptionsChange={vi.fn()}
        onAssign={vi.fn()}
      />
    );
    expect(screen.getByText('Session Mode')).toBeInTheDocument();
    const teacherBtn = screen.getByRole('button', { name: /Teacher-paced/ });
    const autoBtn = screen.getByRole('button', { name: /Auto-progress/ });
    expect(teacherBtn).toHaveAttribute('aria-pressed', 'true');
    expect(autoBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(autoBtn);
    expect(onModeChange).toHaveBeenCalledWith('auto');
  });

  it('renders extraSlot and plcSlot content', () => {
    render(
      <AssignModal<QuizOptions>
        isOpen
        onClose={vi.fn()}
        itemTitle="Quiz"
        options={{ speedBonusEnabled: false }}
        onOptionsChange={vi.fn()}
        onAssign={vi.fn()}
        extraSlot={<div data-testid="extra-slot">Extra toggles</div>}
        plcSlot={<div data-testid="plc-slot">PLC options</div>}
      />
    );
    expect(screen.getByTestId('extra-slot')).toBeInTheDocument();
    expect(screen.getByTestId('plc-slot')).toBeInTheDocument();
  });

  it('binds assignmentName input to onAssignmentNameChange', () => {
    const onAssignmentNameChange = vi.fn();
    render(
      <AssignModal<QuizOptions>
        isOpen
        onClose={vi.fn()}
        itemTitle="Quiz"
        options={{ speedBonusEnabled: false }}
        onOptionsChange={vi.fn()}
        onAssign={vi.fn()}
        assignmentName="Period 1"
        onAssignmentNameChange={onAssignmentNameChange}
      />
    );
    const input = screen.getByLabelText<HTMLInputElement>('Assignment Name');
    expect(input.value).toBe('Period 1');
    fireEvent.change(input, { target: { value: 'Period 3' } });
    expect(onAssignmentNameChange).toHaveBeenCalledWith('Period 3');
  });

  it('calls onAssign with the correct payload', async () => {
    const onAssign = vi.fn().mockResolvedValue(undefined);
    const options: QuizOptions = { speedBonusEnabled: true };
    render(
      <AssignModal<QuizOptions>
        isOpen
        onClose={vi.fn()}
        itemTitle="Quiz"
        modes={MODES}
        selectedMode="auto"
        onModeChange={vi.fn()}
        options={options}
        onOptionsChange={vi.fn()}
        onAssign={onAssign}
        assignmentName="Period 2"
        onAssignmentNameChange={vi.fn()}
      />
    );
    const assignButtons = screen.getAllByRole('button', { name: /assign/i });
    // Grab the footer "Assign" button (not a header Cancel/Assign label),
    // there is exactly one named "Assign".
    const confirm = assignButtons.find(
      (b) => b.textContent?.trim() === 'Assign'
    );
    if (!confirm) throw new Error('Confirm button not found');
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(onAssign).toHaveBeenCalledTimes(1);
    });
    expect(onAssign).toHaveBeenCalledWith({
      mode: 'auto',
      options,
      assignmentName: 'Period 2',
    });
  });

  it('disables Assign when confirmDisabled is true and exposes confirmDisabledReason as tooltip', () => {
    const onAssign = vi.fn();
    render(
      <AssignModal<QuizOptions>
        isOpen
        onClose={vi.fn()}
        itemTitle="Quiz"
        options={{ speedBonusEnabled: false }}
        onOptionsChange={vi.fn()}
        onAssign={onAssign}
        confirmDisabled
        confirmDisabledReason="No periods selected"
      />
    );
    const confirm = screen
      .getAllByRole('button', { name: /assign/i })
      .find((b) => b.textContent?.trim() === 'Assign');
    if (!confirm) throw new Error('Confirm button not found');
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('title', 'No periods selected');
    fireEvent.click(confirm);
    expect(onAssign).not.toHaveBeenCalled();
  });
});
