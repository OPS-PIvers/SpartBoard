import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgendaConfig, WidgetData } from '@/types';
import type { Course } from '@/utils/course/contract';
import { AgendaWidget } from './Widget';

const h = vi.hoisted(() => ({
  updateWidget: vi.fn(),
  saveCourse: vi.fn(),
  deckCheck: vi.fn(),
  flagOn: true,
  rosters: [] as unknown[],
  courses: [] as unknown[],
  loading: false,
  error: null as string | null,
}));

vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({ updateWidget: h.updateWidget }),
  useDashboardCanvasSelector: <T,>(pick: (s: { rosters: unknown[] }) => T) =>
    pick({ rosters: h.rosters }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => h.flagOn }),
}));
vi.mock('@/hooks/useCourses', () => ({
  useCourses: (enabled: boolean) => ({
    courses: enabled ? h.courses : [],
    loading: enabled && h.loading,
    error: enabled ? h.error : null,
    saveCourse: h.saveCourse,
  }),
}));
vi.mock('./useAgendaDeckCheck', () => ({
  useAgendaDeckCheck: (course: Course | null) => {
    h.deckCheck(course?.id);
  },
}));

const FILE = '1AbCdEfGhIjKlMnOp';
const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  name: 'English 9',
  teacherName: 'T',
  rosterIds: ['r1', 'r2'],
  agenda: { fileId: FILE, title: 'Daily agenda' },
  pinnedLinks: [],
  familyLink: null,
  linkId: 'l1',
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const widget = (config: AgendaConfig = {}): WidgetData => ({
  id: 'w1',
  type: 'agenda',
  x: 0,
  y: 0,
  w: 560,
  h: 360,
  z: 1,
  flipped: false,
  config,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.flagOn = true;
  h.loading = false;
  h.error = null;
  h.rosters = [
    { id: 'r1', name: 'English 9 P1' },
    { id: 'r2', name: 'English 9 P2' },
    { id: 'r3', name: 'History P6' },
  ];
  h.courses = [course()];
});

describe('AgendaWidget', () => {
  it('says so when Course and Agenda is off for the teacher', () => {
    h.flagOn = false;
    render(<AgendaWidget widget={widget()} />);
    expect(screen.getByText(/aren't turned on/)).toBeInTheDocument();
  });

  it('lists each Course once and a class in no Course, and saves the pick', async () => {
    render(<AgendaWidget widget={widget()} />);
    expect(screen.getByText('Select a course')).toBeInTheDocument();
    expect(screen.getByText('2 sections · Daily agenda')).toBeInTheDocument();
    expect(screen.getByText('No agenda yet')).toBeInTheDocument();
    await userEvent.click(screen.getByText('English 9'));
    expect(h.updateWidget).toHaveBeenCalledWith('w1', {
      config: { courseId: 'c1', rosterId: 'r1' },
    });
  });

  it('shows the picked deck from its first slide and opens it in Slides', () => {
    render(
      <AgendaWidget widget={widget({ courseId: 'c1', rosterId: 'r1' })} />
    );
    expect(screen.getByTitle('Agenda: English 9')).toHaveAttribute(
      'src',
      `https://docs.google.com/presentation/d/${FILE}/embed?start=false&loop=false&rm=minimal`
    );
    expect(
      screen.getByRole('link', { name: 'Open in Google Slides' })
    ).toHaveAttribute(
      'href',
      `https://docs.google.com/presentation/d/${FILE}/edit`
    );
    expect(h.deckCheck).toHaveBeenLastCalledWith('c1');
  });

  it('reloads the deck on Reload', async () => {
    render(<AgendaWidget widget={widget({ courseId: 'c1' })} />);
    const before = screen.getByTitle('Agenda: English 9');
    await userEvent.click(
      screen.getByRole('button', { name: 'Reload agenda' })
    );
    expect(screen.getByTitle('Agenda: English 9')).not.toBe(before);
  });

  it('changes course and goes back without saving', async () => {
    render(<AgendaWidget widget={widget({ courseId: 'c1' })} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Change course' })
    );
    expect(screen.getByText('Select a course')).toBeInTheDocument();
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent(
      'English 9'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTitle('Agenda: English 9')).toBeInTheDocument();
    expect(h.updateWidget).not.toHaveBeenCalled();
  });

  it('sends a Course with no Agenda to My Classes', async () => {
    h.courses = [course({ agenda: null })];
    const opened = vi.fn();
    window.addEventListener('open-sidebar', opened);
    render(<AgendaWidget widget={widget({ courseId: 'c1' })} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Set up in My Classes' })
    );
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({
      section: 'classes',
    });
    window.removeEventListener('open-sidebar', opened);
  });

  it('follows a picked class into the Course it was merged into', () => {
    h.courses = [
      course({ id: 'c2', name: 'English', rosterIds: ['r1', 'r3'] }),
    ];
    render(
      <AgendaWidget widget={widget({ courseId: 'c1', rosterId: 'r1' })} />
    );
    expect(screen.getByTitle('Agenda: English')).toBeInTheDocument();
  });

  it('warns when students cannot open the deck', () => {
    h.courses = [
      course({
        deckCheck: { checkedAt: 1, modifiedAt: null, sharing: 'private' },
      }),
    ];
    render(<AgendaWidget widget={widget({ courseId: 'c1' })} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Students can’t open this deck.'
    );
  });

  it('waits for Courses before showing the picker for a saved pick', () => {
    h.loading = true;
    h.courses = [];
    render(<AgendaWidget widget={widget({ courseId: 'c1' })} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows only the slide when the widget is tiny', () => {
    render(
      <AgendaWidget
        widget={{ ...widget({ courseId: 'c1' }), w: 200, h: 140 }}
      />
    );
    expect(screen.getByTitle('Agenda: English 9')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change course' })).toBeNull();
  });

  it('waits for Courses when only the classes have loaded', () => {
    h.loading = true;
    h.courses = [];
    render(
      <AgendaWidget widget={widget({ courseId: 'c1', rosterId: 'r1' })} />
    );
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('No agenda yet')).toBeNull();
  });

  it('says so when Courses fail to load', () => {
    h.error = 'denied';
    h.courses = [];
    render(<AgendaWidget widget={widget({ courseId: 'c1' })} />);
    expect(screen.getByText("Couldn't load courses")).toBeInTheDocument();
  });

  it('points a teacher with no classes to My Classes', () => {
    h.rosters = [];
    h.courses = [];
    render(<AgendaWidget widget={widget()} />);
    expect(
      screen.getByRole('button', { name: 'Open My Classes' })
    ).toBeInTheDocument();
  });
});
