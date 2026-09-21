import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { getTodayStr } from './utils';
import type {
  DailySchedule,
  ScheduleConfig,
  ScheduleItem,
  WidgetData,
} from '@/types';
import {
  ScheduleCalendarImportField,
  ScheduleListField,
} from './settingsFields';

vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/context/useDialog', () => ({ useDialog: vi.fn() }));
vi.mock('@/hooks/useFeaturePermissions', () => ({
  useFeaturePermissions: vi.fn(),
}));
vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: vi.fn(),
}));

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

const mockedUseDashboard = vi.mocked(useDashboard);
const mockedUseDialog = vi.mocked(useDialog);
const mockedUseFeaturePermissions = vi.mocked(useFeaturePermissions);
const mockedUseWidgetBuildingId = vi.mocked(useWidgetBuildingId);

const widget = {
  id: 'schedule-test-1',
  type: 'schedule',
} as unknown as WidgetData;

const translate = (key: string, options?: Record<string, unknown>) => {
  const leaf = key.split('.').pop() ?? key;
  const labels: Record<string, string> = {
    deletedPrefix: 'Deleted',
    eventDeleted: 'Event deleted',
    undo: 'Undo',
    addEvent: 'Add event',
    newSchedule: 'New schedule',
    deleteSchedule: 'Delete schedule',
    addSchedule: 'Add schedule',
    noSchedules: 'No schedules yet.',
    scheduleNamePlaceholder: 'Schedule name',
    sort: 'Sort by time',
    todayOnly: 'Today only',
    addFirstEvent: 'Add your first event',
    importToday: 'Import today',
    importedCalendarEvents: 'Imported {{count}} event(s) from Calendar.',
    noEvents: 'No events in this schedule.',
    buildingSchedules: 'Building schedules',
    noBuildingSchedules: 'No building schedules.',
  };
  let value = labels[leaf] ?? leaf;
  for (const [name, option] of Object.entries(options ?? {})) {
    value = value.replace('{{' + name + '}}', String(option));
  }
  return value;
};

const makeCtx = (
  config: ScheduleConfig,
  updateConfig: (patch: Record<string, unknown>) => void = vi.fn()
) =>
  ({
    config,
    widget,
    isAdmin: false,
    canAccessFeature: vi.fn(() => true),
    canAccessWidget: vi.fn(() => true),
    toolLabel: vi.fn((type: string) => type),
    t: translate,
    surface: 'drawer',
    updateConfig,
    id: 'schedule-field',
    labelId: 'schedule-field-label',
    describedBy: undefined,
  }) as unknown as CustomRenderCtx;

const item = (
  id: string,
  task: string,
  startTime: string
): ScheduleItem & { id: string } => ({
  id,
  startTime,
  task,
  done: false,
  mode: 'clock',
  linkedWidgets: [],
});

const schedule = (
  id: string,
  name: string,
  items: ScheduleItem[]
): DailySchedule => ({
  id,
  name,
  days: [],
  items,
});

const setup = (widgets: WidgetData[] = []) => {
  const addToast = vi.fn();
  const subscribeToPermission = vi.fn(() => vi.fn());
  mockedUseDashboard.mockReturnValue({
    activeDashboard: { widgets },
    addToast,
  } as unknown as ReturnType<typeof useDashboard>);
  mockedUseDialog.mockReturnValue({
    showConfirm: vi.fn().mockResolvedValue(true),
  } as unknown as ReturnType<typeof useDialog>);
  mockedUseFeaturePermissions.mockReturnValue({
    subscribeToPermission,
  } as unknown as ReturnType<typeof useFeaturePermissions>);
  mockedUseWidgetBuildingId.mockReturnValue(undefined);
  return { addToast };
};

describe('Schedule settings drawer fields', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never stores the legacy sentinel id when migrating items into schedules', () => {
    const updateConfig = vi.fn();
    setup();
    const ctx = makeCtx(
      {
        items: [item('math', 'Math', '09:00')],
        settingsSelectedScheduleId: 'default',
      } as unknown as ScheduleConfig,
      updateConfig
    );
    render(React.createElement(ScheduleListField, { ctx }));

    fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));

    const patch = updateConfig.mock.calls[0]?.[0] as {
      items: ScheduleItem[];
      schedules: DailySchedule[];
    };
    expect(patch.schedules).toHaveLength(2);
    expect(patch.schedules[0].id).not.toBe('default');
    expect(patch.schedules[0].items).toEqual([
      expect.objectContaining({ task: 'Math' }),
    ]);
    expect(patch.items).toEqual([]);
  });

  it('renaming a stored schedule keeps its events and its siblings', () => {
    const updateConfig = vi.fn();
    setup();
    const ctx = makeCtx(
      {
        items: [],
        // A board already carrying the sentinel from the shipped bug.
        schedules: [
          schedule('default', 'Default Schedule', [
            item('math', 'Math', '09:00'),
          ]),
          schedule('sched-b', 'Early release', []),
        ],
        settingsSelectedScheduleId: 'default',
      },
      updateConfig
    );
    render(React.createElement(ScheduleListField, { ctx }));

    fireEvent.change(screen.getByPlaceholderText('Schedule name'), {
      target: { value: 'Regular Day' },
    });

    const patch = updateConfig.mock.calls[0]?.[0] as {
      items?: ScheduleItem[];
      schedules: DailySchedule[];
    };
    expect(patch.schedules).toHaveLength(2);
    expect(patch.schedules[0]).toMatchObject({
      id: 'default',
      name: 'Regular Day',
    });
    expect(patch.schedules[0].items).toEqual([
      expect.objectContaining({ task: 'Math' }),
    ]);
    expect(patch.schedules[1]).toMatchObject({ id: 'sched-b' });
    expect(patch.items).toBeUndefined();
  });

  it('prunes expired one-off events when importing calendar events', () => {
    const expired = {
      ...item('expired', 'Old event', '08:00'),
      oneOffDate: '2000-01-01',
    };
    const today = getTodayStr();
    const calendar = {
      id: 'calendar-1',
      type: 'calendar',
      config: {
        events: [{ date: today, title: 'Science', time: '09:00' }],
      },
    } as unknown as WidgetData;
    const updateConfig = vi.fn();
    setup([calendar]);
    const ctx = makeCtx(
      {
        items: [],
        schedules: [schedule('sched-a', 'A', [expired])],
        settingsSelectedScheduleId: 'sched-a',
      },
      updateConfig
    );
    render(React.createElement(ScheduleCalendarImportField, { ctx }));

    fireEvent.click(screen.getByRole('button', { name: 'Import today' }));

    const patch = updateConfig.mock.calls[0]?.[0] as {
      schedules: DailySchedule[];
    };
    expect(patch.schedules[0].items).toHaveLength(1);
    expect(patch.schedules[0].items[0]).toMatchObject({
      task: 'Science',
      startTime: '09:00',
    });
    expect(patch.schedules[0].items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'expired' })])
    );
  });

  it('deletes a non-blank event immediately and offers Undo', () => {
    const first = item('a', 'Math', '09:00');
    const removed = item('b', 'Reading', '10:00');
    const last = item('c', 'Recess', '11:00');
    const updateConfig = vi.fn();
    const { addToast } = setup();
    const ctx = makeCtx(
      {
        items: [],
        schedules: [schedule('sched-a', 'A', [first, removed, last])],
        settingsSelectedScheduleId: 'sched-a',
      },
      updateConfig
    );
    render(React.createElement(ScheduleListField, { ctx }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete event' })[1]);

    expect(updateConfig).toHaveBeenCalledWith({
      schedules: [schedule('sched-a', 'A', [first, last])],
    });
    expect(addToast).toHaveBeenCalledWith(
      'Deleted "Reading"',
      'info',
      expect.objectContaining({ label: 'Undo' })
    );
  });

  it('deletes a blank event without adding an Undo toast', () => {
    const first = item('a', '', '');
    const updateConfig = vi.fn();
    const { addToast } = setup();
    const ctx = makeCtx(
      {
        items: [],
        schedules: [schedule('sched-a', 'A', [first])],
        settingsSelectedScheduleId: 'sched-a',
      },
      updateConfig
    );
    render(React.createElement(ScheduleListField, { ctx }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));

    expect(updateConfig).toHaveBeenCalledWith({
      schedules: [schedule('sched-a', 'A', [])],
    });
    expect(addToast).not.toHaveBeenCalled();
  });

  it('undoes an event deletion at its original index using the live schedule', () => {
    const first = item('a', 'Math', '09:00');
    const removed = item('b', 'Reading', '10:00');
    const last = item('c', 'Recess', '11:00');
    const original = schedule('sched-a', 'A', [first, removed, last]);
    const updateConfig = vi.fn();
    const { addToast } = setup();
    const ctx = makeCtx(
      {
        items: [],
        schedules: [original],
        settingsSelectedScheduleId: 'sched-a',
      },
      updateConfig
    );
    const view = render(React.createElement(ScheduleListField, { ctx }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete event' })[1]);
    const undo = addToast.mock.calls[0][2] as { onClick: () => void };
    const postDelete = schedule('sched-a', 'A', [first, last]);
    updateConfig.mockClear();
    const postDeleteCtx = makeCtx(
      {
        items: [],
        schedules: [postDelete],
        settingsSelectedScheduleId: 'sched-a',
      },
      updateConfig
    );
    view.rerender(
      React.createElement(ScheduleListField, { ctx: postDeleteCtx })
    );
    act(() => undo.onClick());
    const restored = schedule('sched-a', 'A', [first, removed, last]);
    expect(updateConfig).toHaveBeenCalledWith({ schedules: [restored] });
  });

  it('drops pending autofocus when switching schedules and does not steal focus on return', () => {
    const first = item('a', 'Math', '09:00');
    const last = item('c', 'Recess', '11:00');
    const original = schedule('sched-a', 'A', [first, last]);
    const other = schedule('sched-b', 'B', []);
    const updateConfig = vi.fn();
    setup();
    const ctx = makeCtx(
      {
        items: [],
        schedules: [original, other],
        settingsSelectedScheduleId: 'sched-a',
      },
      updateConfig
    );
    const view = render(React.createElement(ScheduleListField, { ctx }));
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    const added = updateConfig.mock.calls.at(-1)?.[0] as {
      schedules: DailySchedule[];
    };
    const addedItem = added.schedules[0].items.at(-1) as ScheduleItem;
    const config = (selected: string): ScheduleConfig => ({
      items: [],
      schedules: [withAdded, other],
      settingsSelectedScheduleId: selected,
    });
    const withAdded = schedule('sched-a', 'A', [first, last, addedItem]);
    const addedCtx = makeCtx(config('sched-a'), updateConfig);
    view.rerender(React.createElement(ScheduleListField, { ctx: addedCtx }));
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(
      screen
        .getAllByPlaceholderText('Task name')
        .some((input) => input === document.activeElement)
    ).toBe(false);
  });
});
