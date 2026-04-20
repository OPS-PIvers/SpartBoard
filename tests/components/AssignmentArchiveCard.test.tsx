import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssignmentArchiveCard } from '@/components/common/library/AssignmentArchiveCard';
import type {
  AssignmentStatusBadge,
  LibraryMenuAction,
  LibraryPrimaryAction,
} from '@/components/common/library/types';

interface Assignment {
  id: string;
  quizTitle: string;
}

const ASSIGNMENT: Assignment = { id: 'a1', quizTitle: 'My Quiz' };

const LIVE_STATUS: AssignmentStatusBadge = {
  label: 'Live',
  tone: 'success',
  dot: true,
};

const ENDED_STATUS: AssignmentStatusBadge = {
  label: 'Ended',
  tone: 'neutral',
};

const basePrimary: LibraryPrimaryAction = {
  label: 'Monitor',
  onClick: vi.fn(),
};

describe('AssignmentArchiveCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with emerald styling in active mode for success tone', () => {
    render(
      <AssignmentArchiveCard<Assignment>
        assignment={ASSIGNMENT}
        mode="active"
        status={LIVE_STATUS}
        primaryAction={{ ...basePrimary, onClick: vi.fn() }}
        title={ASSIGNMENT.quizTitle}
      />
    );
    const badge = screen.getByTestId('assignment-status-badge');
    expect(badge).toHaveTextContent('Live');
    expect(badge.className).toContain('bg-emerald-100');
    expect(badge.className).toContain('text-emerald-700');
  });

  it('renders with slate styling in archive mode for neutral tone', () => {
    const { container } = render(
      <AssignmentArchiveCard<Assignment>
        assignment={ASSIGNMENT}
        mode="archive"
        status={ENDED_STATUS}
        primaryAction={{ ...basePrimary, label: 'Results', onClick: vi.fn() }}
        title={ASSIGNMENT.quizTitle}
      />
    );
    const badge = screen.getByTestId('assignment-status-badge');
    expect(badge).toHaveTextContent('Ended');
    expect(badge.className).toContain('bg-slate-200');
    expect(badge.className).toContain('text-slate-500');
    // Archive mode applies muted card styling (opacity-70 on root)
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('opacity-70');
  });

  it('opens overflow menu on click and closes on outside click', () => {
    const secondary: LibraryMenuAction[] = [
      { id: 'edit', label: 'Edit', onClick: vi.fn() },
      { id: 'share', label: 'Share', onClick: vi.fn() },
    ];
    render(
      <AssignmentArchiveCard<Assignment>
        assignment={ASSIGNMENT}
        mode="active"
        status={LIVE_STATUS}
        primaryAction={{ ...basePrimary, onClick: vi.fn() }}
        secondaryActions={secondary}
        title={ASSIGNMENT.quizTitle}
      />
    );
    const trigger = screen.getByRole('button', { name: 'More actions' });
    // Menu initially closed
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Edit/ })).toBeInTheDocument();
    // Close on outside click (mousedown on document.body)
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('styles destructive actions with destructive classes', () => {
    const secondary: LibraryMenuAction[] = [
      { id: 'edit', label: 'Edit', onClick: vi.fn() },
      {
        id: 'delete',
        label: 'Delete',
        onClick: vi.fn(),
        destructive: true,
      },
    ];
    render(
      <AssignmentArchiveCard<Assignment>
        assignment={ASSIGNMENT}
        mode="active"
        status={LIVE_STATUS}
        primaryAction={{ ...basePrimary, onClick: vi.fn() }}
        secondaryActions={secondary}
        title={ASSIGNMENT.quizTitle}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const deleteBtn = screen.getByRole('menuitem', { name: /Delete/ });
    expect(deleteBtn.className).toContain('text-brand-red-dark');
    const editBtn = screen.getByRole('menuitem', { name: /Edit/ });
    expect(editBtn.className).not.toContain('text-brand-red-dark');
  });

  it('renders disabled primary action with disabledReason as tooltip', () => {
    const onClick = vi.fn();
    render(
      <AssignmentArchiveCard<Assignment>
        assignment={ASSIGNMENT}
        mode="active"
        status={LIVE_STATUS}
        primaryAction={{
          label: 'Monitor',
          onClick,
          disabled: true,
          disabledReason: 'Session not started',
        }}
        title={ASSIGNMENT.quizTitle}
      />
    );
    const btn = screen.getByRole('button', { name: /Monitor/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Session not started');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
