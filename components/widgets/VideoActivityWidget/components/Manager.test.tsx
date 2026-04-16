import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Manager } from './Manager';
import {
  VideoActivityMetadata,
  VideoActivitySession,
  VideoActivitySessionSettings,
} from '@/types';

const activity: VideoActivityMetadata = {
  id: 'activity-1',
  title: 'Cells Review',
  youtubeUrl: 'https://youtube.com/watch?v=abc123',
  driveFileId: 'drive-file-1',
  questionCount: 5,
  createdAt: 1712000000000,
  updatedAt: 1712000000000,
};

const defaultSessionSettings: VideoActivitySessionSettings = {
  autoPlay: false,
  requireCorrectAnswer: true,
  allowSkipping: false,
};

const sessions: VideoActivitySession[] = [
  {
    id: 'session-1',
    activityId: activity.id,
    activityTitle: activity.title,
    assignmentName: '1st period',
    teacherUid: 'teacher-1',
    youtubeUrl: activity.youtubeUrl,
    questions: [],
    settings: defaultSessionSettings,
    status: 'active',
    allowedPins: [],
    createdAt: 1712000000000,
  },
  {
    id: 'session-2',
    activityId: activity.id,
    activityTitle: activity.title,
    assignmentName: '2nd period',
    teacherUid: 'teacher-1',
    youtubeUrl: activity.youtubeUrl,
    questions: [],
    settings: defaultSessionSettings,
    status: 'ended',
    allowedPins: [],
    createdAt: 1712003600000,
    endedAt: 1712007200000,
    expiresAt: 1712007200000,
  },
];

const baseProps = {
  activities: [activity],
  loading: false,
  error: null,
  onNew: vi.fn(),
  onImport: vi.fn(),
  onEdit: vi.fn(),
  onResults: vi.fn(),
  onCloseResults: vi.fn(),
  onOpenSessionResults: vi.fn(),
  onRenameSession: vi.fn().mockResolvedValue(undefined),
  onEndSession: vi.fn().mockResolvedValue(undefined),
  onAssign: vi.fn().mockResolvedValue('session-3'),
  onDelete: vi.fn(),
  defaultSessionSettings,
  sessionResultsActivity: null,
  activitySessions: [],
  sessionsLoading: false,
};

describe('VideoActivity Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('creates a named assignment session from the assign modal', async () => {
    const user = userEvent.setup();
    render(<Manager {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /assign/i }));
    const nameInput = screen.getByLabelText(/assignment name/i);
    await user.clear(nameInput);
    await user.type(nameInput, '1st period');
    await user.click(
      screen.getByRole('button', { name: /create session link/i })
    );

    await waitFor(() =>
      expect(baseProps.onAssign).toHaveBeenCalledWith(
        activity,
        defaultSessionSettings,
        '1st period'
      )
    );

    expect(await screen.findByText('Session Created')).toBeInTheDocument();
    expect(screen.getByText('1st period')).toBeInTheDocument();
  });

  it('opens activity-scoped session history from the results action', async () => {
    const user = userEvent.setup();
    render(<Manager {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /results/i }));

    expect(baseProps.onResults).toHaveBeenCalledWith(activity);
  });

  it('renames and opens an existing assignment from the results modal', async () => {
    const user = userEvent.setup();
    render(
      <Manager
        {...baseProps}
        sessionResultsActivity={activity}
        activitySessions={sessions}
      />
    );

    expect(screen.getByText('1st period')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /rename/i })[0]);

    const renameInput = screen.getByDisplayValue('1st period');
    await user.clear(renameInput);
    await user.type(renameInput, 'A block');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(baseProps.onRenameSession).toHaveBeenCalledWith(
        'session-1',
        'A block'
      )
    );

    await user.click(
      screen.getAllByRole('button', { name: /open results/i })[0]
    );
    expect(baseProps.onOpenSessionResults).toHaveBeenCalledWith(sessions[0]);
  });

  it('shows link controls and ends an active session from the results modal', async () => {
    const user = userEvent.setup();
    render(
      <Manager
        {...baseProps}
        sessionResultsActivity={activity}
        activitySessions={sessions}
      />
    );

    expect(
      screen.getAllByRole('button', { name: /copy link/i })[0]
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /end session/i }));
    await user.click(screen.getByRole('button', { name: /confirm end/i }));

    await waitFor(() =>
      expect(baseProps.onEndSession).toHaveBeenCalledWith('session-1')
    );
  });
});
