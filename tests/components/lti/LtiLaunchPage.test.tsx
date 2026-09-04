import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Instructor launches must land on the in-iframe teacher review, not a diagnostic card.

const exchange = vi.fn();

vi.mock('@/config/firebase', () => ({ auth: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => exchange }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: vi.fn() }));

const reviewProps = vi.fn();
vi.mock('@/components/classroomAddon/TeacherReviewRoute', () => ({
  ClassroomAddonTeacherReview: (props: Record<string, unknown>) => {
    reviewProps(props);
    return <div data-testid="teacher-review" />;
  },
}));

const instructorLaunch = (custom: Record<string, unknown> | null) => ({
  data: {
    role: 'teacher',
    messageType: 'LtiResourceLinkRequest',
    isDeepLinking: false,
    contextId: 'ctx',
    contextTitle: 'English',
    resourceLinkId: 'rl',
    deploymentId: 'dep',
    name: 'Ms. Vaage',
    email: null,
    studentRole: false,
    custom,
  },
});

describe('LtiLaunchPage instructor launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/lti/teacher?lc=code-1');
  });

  it('mounts the Schoology teacher review for the attached quiz', async () => {
    exchange.mockResolvedValue(
      instructorLaunch({ kind: 'quiz', quiz_code: 'ABC123' })
    );
    const { LtiLaunchPage } = await import('@/components/lti/LtiLaunchPage');
    render(<LtiLaunchPage />);
    expect(await screen.findByTestId('teacher-review')).toBeTruthy();
    expect(reviewProps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'quiz',
        code: 'ABC123',
        platform: 'schoology',
      })
    );
    expect(screen.queryByText(/Launch validated/)).toBeNull();
  });

  it('shows a plain unlinked message when no quiz is attached', async () => {
    exchange.mockResolvedValue(instructorLaunch(null));
    const { LtiLaunchPage } = await import('@/components/lti/LtiLaunchPage');
    render(<LtiLaunchPage />);
    await waitFor(() =>
      expect(screen.getByText(/Nothing to show for this link/)).toBeTruthy()
    );
    expect(screen.queryByTestId('teacher-review')).toBeNull();
    expect(screen.queryByText(/Launch validated/)).toBeNull();
    expect(screen.queryByText(/Deployment/)).toBeNull();
  });
});
