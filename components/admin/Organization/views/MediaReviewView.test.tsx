import React from 'react';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MediaReviewView, type MediaReviewViewProps } from './MediaReviewView';
import { filterVisibleSections } from '@/components/admin/Organization/lib/sectionVisibility';
import {
  EMPTY_MEDIA_FILTERS,
  type MediaResponseRow,
} from '@/hooks/useOrgMediaResponses';

// Minimal lucide-react stub — avoids loading the full icon bundle.
vi.mock('lucide-react', () => {
  function icon(name: string) {
    const Stub = (props: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement('span', { 'data-icon': name, ...props });
    Stub.displayName = name;
    return Stub;
  }
  const mocks: Record<string, unknown> = {};
  return new Proxy(mocks, {
    get(target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && !(prop in target)) {
        target[prop] = icon(prop);
      }
      return target[prop as string];
    },
  });
});

vi.mock('@/config/firebase', () => ({ functions: {} }));

const ROWS: MediaResponseRow[] = [
  {
    sessionId: 's1',
    responseKey: 'r1',
    questionId: 'q-1',
    quizTitle: 'Fractions Review',
    teacherUid: 't1',
    teacherEmail: 'alvarez@x.org',
    studentLabel: 'Pin 4821',
    lastActivityAt: 1700000000000,
    takes: [
      {
        artifactId: 'a1',
        archiveStatus: 'archived',
        driveFileId: 'd1',
        hasStorageObject: false,
      },
      {
        artifactId: 'a2',
        archiveStatus: 'archived',
        driveFileId: 'd2',
        hasStorageObject: false,
      },
    ],
  },
  {
    sessionId: 's1',
    responseKey: 'r2',
    questionId: 'q-1',
    quizTitle: 'Fractions Review',
    teacherUid: 't1',
    teacherEmail: 'alvarez@x.org',
    studentLabel: 'Pin 9104',
    lastActivityAt: 1699000000000,
    takes: [
      {
        artifactId: 'b1',
        archiveStatus: 'archived',
        driveFileId: 'd3',
        hasStorageObject: false,
      },
    ],
  },
];

const renderView = (overrides: Partial<MediaReviewViewProps> = {}) => {
  const props: MediaReviewViewProps = {
    rows: ROWS,
    teachers: [{ uid: 't1', email: 'alvarez@x.org' }],
    loading: false,
    error: null,
    truncated: false,
    deleting: false,
    filters: EMPTY_MEDIA_FILTERS,
    results: null,
    onFiltersChange: vi.fn(),
    onReload: vi.fn(),
    onDismissResults: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<MediaReviewView {...props} />);
  return props;
};

afterEach(cleanup);

describe('media review section visibility', () => {
  const sections = [
    { id: 'users' },
    { id: 'mediaReview', domainAdminOnly: true },
  ];

  it('hides the console from a building admin', () => {
    expect(
      filterVisibleSections(sections, 'building_admin').map((s) => s.id)
    ).toEqual(['users']);
  });

  it('shows the console to a domain admin and a super admin', () => {
    for (const role of ['domain_admin', 'super_admin'] as const) {
      expect(filterVisibleSections(sections, role).map((s) => s.id)).toContain(
        'mediaReview'
      );
    }
  });
});

describe('MediaReviewView states', () => {
  it('renders a loading state', () => {
    renderView({ loading: true });
    expect(screen.getByText('Loading student media…')).toBeInTheDocument();
  });

  it('renders an empty state', () => {
    renderView({ rows: [] });
    expect(screen.getByText('No recorded media found')).toBeInTheDocument();
  });

  it('renders an error state with a retry action', () => {
    const props = renderView({ rows: [], error: 'permission-denied' });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onReload).toHaveBeenCalled();
  });

  it('warns when the list was truncated', () => {
    renderView({ truncated: true });
    expect(screen.getByText(/list is capped/i)).toBeInTheDocument();
  });
});

describe('MediaReviewView delete confirmation', () => {
  it('names the exact count and target before allowing delete', () => {
    const props = renderView();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select Pin 4821, question q-1' })
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete media \(1\)/ }));

    const dialog = screen.getByRole('dialog', {
      name: 'Permanently delete student media',
    });
    expect(
      within(dialog).getByText(
        /permanently delete 2 file\(s\) across 1 response\(s\) from alvarez@x\.org/i
      )
    ).toBeInTheDocument();

    // Two-step: the destructive button stays disabled until the word is typed.
    const confirmBtn = within(dialog).getByRole('button', {
      name: 'Delete permanently',
    });
    expect(confirmBtn).toBeDisabled();
    expect(props.onDelete).not.toHaveBeenCalled();

    fireEvent.change(
      within(dialog).getByLabelText(/Type "DELETE" to confirm/),
      {
        target: { value: 'DELETE' },
      }
    );
    fireEvent.click(confirmBtn);
    expect(props.onDelete).toHaveBeenCalledWith([ROWS[0]]);
  });

  it('deletes every selected set when select-all is used', () => {
    const props = renderView();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select every deletable response' })
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete media \(2\)/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByLabelText(/Type "DELETE" to confirm/),
      {
        target: { value: 'DELETE' },
      }
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete permanently' })
    );
    expect(props.onDelete).toHaveBeenCalledWith(ROWS);
  });
});

describe('MediaReviewView partial failure', () => {
  it('lists each failed item rather than a single pass/fail message', () => {
    renderView({
      results: [
        {
          sessionId: 's1',
          responseKey: 'r1',
          questionId: 'q-1',
          artifactId: 'a1',
          status: 'deleted',
        },
        {
          sessionId: 's1',
          responseKey: 'r2',
          questionId: 'q-1',
          artifactId: 'b1',
          status: 'failed',
          error: "Teacher's Google account is disconnected.",
        },
      ],
    });
    expect(screen.getByText('1 file(s) deleted, 1 failed')).toBeInTheDocument();
    expect(
      screen.getByText(/Teacher's Google account is disconnected\./)
    ).toBeInTheDocument();
  });
});
