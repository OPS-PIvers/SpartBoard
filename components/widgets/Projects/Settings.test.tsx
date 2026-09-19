import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { ProjectsSettings } from './Settings';

vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useProjectsWidgetSettings');

const updateWidget = vi.fn();

const widget: WidgetData = {
  id: 'projects-1',
  type: 'projects',
  x: 0,
  y: 0,
  w: 620,
  h: 560,
  z: 1,
  flipped: true,
  config: { view: 'board', projectId: 'project-a' },
};

describe('ProjectsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
    });
    (
      useProjectsWidgetSettings as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({ enabled: true });
  });

  it('says so when the rollout switch is off', () => {
    (
      useProjectsWidgetSettings as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({ enabled: false });
    render(<ProjectsSettings widget={widget} />);
    expect(
      screen.getByText(/switched off for this district/)
    ).toBeInTheDocument();
  });

  // R1 — authoring lives in the widget body now, so the drawer only points at it.
  it('sends the teacher back to the library rather than authoring here', () => {
    render(<ProjectsSettings widget={widget} />);
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Rubric')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to Library' }));
    expect(updateWidget).toHaveBeenCalledWith('projects-1', {
      config: expect.objectContaining({
        view: 'manager',
        managerTab: 'library',
      }) as object,
    });
  });
});
