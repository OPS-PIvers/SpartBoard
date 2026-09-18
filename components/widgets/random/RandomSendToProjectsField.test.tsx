import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RandomConfig, WidgetData } from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { RandomSendToProjectsField } from './settingsFields';

vi.mock('@/context/useDashboard');
vi.mock('@/context/useDialog');

const updateWidget = vi.fn();
const addToast = vi.fn();
const showConfirm = vi.fn().mockResolvedValue(true);

const GROUP_A = '11111111-1111-4111-8111-111111111111';
const GROUP_B = '22222222-2222-4222-8222-222222222222';

const projectsWidget = { id: 'projects-1', type: 'projects', config: {} };

const dashboard = (overrides: Record<string, unknown> = {}) => ({
  activeDashboard: {
    widgets: [projectsWidget],
    sharedGroups: [{ id: GROUP_A, name: 'The Otters' }],
  },
  activeRosterId: 'roster-1',
  addToast,
  rosters: [],
  updateWidget,
  ...overrides,
});

const ctx = (config: Partial<RandomConfig>): CustomRenderCtx =>
  ({
    config: {
      rosterMode: 'class',
      lastResult: [
        { id: GROUP_A, names: ['Ann', 'Bo'], studentIds: ['s1', 's2'] },
        { id: GROUP_B, names: ['Cy'], studentIds: ['s3'] },
      ],
      ...config,
    } as unknown as Record<string, unknown>,
    widget: { id: 'random-1' } as WidgetData,
    isAdmin: false,
    canAccessFeature: () => true,
    t: (key: string) => key,
    updateConfig: vi.fn(),
    id: 'field',
    labelId: 'field-label',
  }) as unknown as CustomRenderCtx;

describe('RandomSendToProjectsField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showConfirm.mockResolvedValue(true);
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      dashboard()
    );
    (useDialog as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      showConfirm,
    });
  });

  const clickSend = () => fireEvent.click(screen.getByRole('button'));

  it('stages the groups on the Projects widget, resolving their names', async () => {
    render(<RandomSendToProjectsField ctx={ctx({})} />);
    clickSend();
    await waitFor(() => expect(updateWidget).toHaveBeenCalled());
    expect(updateWidget).toHaveBeenCalledWith('projects-1', {
      config: {
        pendingImport: {
          rosterId: 'roster-1',
          at: expect.any(Number) as number,
          groups: [
            { name: 'The Otters', studentIds: ['s1', 's2'] },
            { name: 'Group 2', studentIds: ['s3'] },
          ],
        },
      },
    });
  });

  it('numbers groups by their original position, not their filtered one', async () => {
    render(
      <RandomSendToProjectsField
        ctx={ctx({
          lastResult: [
            { id: GROUP_B, names: [], studentIds: [] },
            { id: GROUP_B, names: ['Cy'], studentIds: ['s3'] },
          ],
        })}
      />
    );
    clickSend();
    await waitFor(() => expect(updateWidget).toHaveBeenCalled());
    const staged = updateWidget.mock.calls[0][1] as {
      config: { pendingImport: { groups: { name: string }[] } };
    };
    expect(staged.config.pendingImport.groups).toEqual([
      { name: 'Group 2', studentIds: ['s3'] },
    ]);
  });

  it('refuses a custom name list, which cannot resolve to students', async () => {
    render(<RandomSendToProjectsField ctx={ctx({ rosterMode: 'custom' })} />);
    clickSend();
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'widgetSettings.random.projectsNeedsRoster',
        'info'
      )
    );
    expect(updateWidget).not.toHaveBeenCalled();
  });

  it('refuses groups that carry no student ids', async () => {
    render(
      <RandomSendToProjectsField
        ctx={ctx({ lastResult: [{ id: GROUP_A, names: ['Ann'] }] })}
      />
    );
    clickSend();
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'widgetSettings.random.generateGroupsFirstProjects',
        'info'
      )
    );
    expect(updateWidget).not.toHaveBeenCalled();
  });

  it('asks before replacing a group set already waiting to be imported', async () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      dashboard({
        activeDashboard: {
          widgets: [
            {
              ...projectsWidget,
              config: { pendingImport: { rosterId: 'r', at: 1, groups: [] } },
            },
          ],
          sharedGroups: [],
        },
      })
    );
    showConfirm.mockResolvedValue(false);
    render(<RandomSendToProjectsField ctx={ctx({})} />);
    clickSend();
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(updateWidget).not.toHaveBeenCalled();
  });

  it('is disabled until a Projects widget is on the board', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      dashboard({ activeDashboard: { widgets: [], sharedGroups: [] } })
    );
    render(<RandomSendToProjectsField ctx={ctx({})} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
