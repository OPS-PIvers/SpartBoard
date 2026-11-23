import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useContext } from 'react';
import { DashboardContext } from '@/context/DashboardContextValue';
import SubsTourLayer from './SubsTourLayer';
import { publishSubsTourRosters } from './subsTourRosters';
import type { ClassRoster } from '@/types';

const auth = vi.hoisted(() => ({ isAdmin: null as boolean | null }));
const seen = vi.hoisted(() => ({
  edit: vi.fn(),
  record: vi.fn(),
  runnerBoard: [] as (string | undefined)[],
  runnerRosters: [] as number[],
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ isAdmin: auth.isAdmin }),
}));
vi.mock('@/components/tours/LiveTourRunner', () => ({
  LiveTourRunner: () => {
    const d = useContext(DashboardContext);
    seen.runnerBoard.push(d?.activeDashboard?.id);
    seen.runnerRosters.push(d?.rosters.length ?? -1);
    return <div data-testid="runner" />;
  },
}));
vi.mock('@/components/tours/editor/TourEditorHost', () => ({
  TourEditorHost: () => <div data-testid="editor" />,
}));
vi.mock(
  '@/components/widgets/GuidedLearning/components/recorder/TourRecordingHost',
  () => ({ TourRecordingHost: () => <div data-testid="recorder" /> })
);
vi.mock('@/components/tours/editor/tourEditStore', () => ({
  requestEditTour: seen.edit,
}));
vi.mock('@/components/tours/tourState', () => ({
  requestRecordTour: seen.record,
}));
vi.mock('@/components/common/ToastContainer', () => ({
  ToastContainer: () => null,
}));

beforeEach(() => {
  auth.isAdmin = null;
  seen.edit.mockClear();
  seen.record.mockClear();
  seen.runnerBoard = [];
  seen.runnerRosters = [];
  window.history.replaceState(null, '', '/subs');
  act(() => publishSubsTourRosters(null));
});

describe('SubsTourLayer', () => {
  it('plays tours on one fixed portal board and gives subs no editor', () => {
    auth.isAdmin = false;
    const { queryByTestId } = render(<SubsTourLayer />);
    expect(queryByTestId('runner')).toBeTruthy();
    expect(queryByTestId('editor')).toBeNull();
    expect(queryByTestId('recorder')).toBeNull();
    expect(seen.runnerBoard.at(-1)).toBe('subs-portal');
  });

  it('opens the editor from an Edit link once admin status loads, then drops the link', () => {
    window.history.replaceState(null, '', '/subs?edit-tour=set-9');
    const { rerender, getByTestId } = render(<SubsTourLayer />);
    expect(seen.edit).not.toHaveBeenCalled();
    auth.isAdmin = true;
    rerender(<SubsTourLayer />);
    expect(getByTestId('editor')).toBeTruthy();
    expect(seen.edit).toHaveBeenCalledWith({ setId: 'set-9', origin: 'subs' });
    expect(window.location.search).toBe('');
    rerender(<SubsTourLayer />);
    expect(seen.edit).toHaveBeenCalledTimes(1);
  });

  it('starts a recording from a Record link', () => {
    auth.isAdmin = true;
    window.history.replaceState(null, '', '/subs?record-tour=1');
    render(<SubsTourLayer />);
    expect(seen.record).toHaveBeenCalledWith('subs');
  });

  it('ignores the links for a sub and still drops them', () => {
    auth.isAdmin = false;
    window.history.replaceState(null, '', '/subs?edit-tour=set-9');
    render(<SubsTourLayer />);
    expect(seen.edit).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it("passes the open board's classes on, so a recording can hide their names", () => {
    auth.isAdmin = true;
    render(<SubsTourLayer />);
    expect(seen.runnerRosters.at(-1)).toBe(0);
    const roster = {
      id: 'r1',
      name: 'P1',
      students: [],
    } as unknown as ClassRoster;
    act(() => publishSubsTourRosters([roster]));
    expect(seen.runnerRosters.at(-1)).toBe(1);
  });
});
