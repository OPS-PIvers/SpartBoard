import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getViewAsTabState, updateViewAsTabState } from '@/utils/viewAsTab';
import { StudentPreviewBanner, StudentPreviewGate } from './StudentPreviewGate';

const h = vi.hoisted(() => ({ claims: {} }));
vi.mock('@/config/firebase', () => ({
  auth: {
    currentUser: {
      getIdTokenResult: () => Promise.resolve({ claims: h.claims }),
    },
  },
}));
vi.mock('@/utils/viewAsStudent', () => ({
  bootStudentPreviewTab: vi.fn(),
  endStudentPreview: () => Promise.resolve(),
}));

afterEach(() => {
  updateViewAsTabState({ studentPage: 'activity' });
  window.history.replaceState(null, '', '/');
});

describe('StudentPreviewBanner', () => {
  it('opens a class student’s My Assignments in the same tab', async () => {
    h.claims = { studentRole: true };
    render(<StudentPreviewBanner />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'My Assignments' })
    );
    expect(getViewAsTabState().studentPage).toBe('my-assignments');
    expect(window.location.pathname).toBe('/my-assignments');
    expect(window.location.search).toBe('?viewAs=student');
    expect(screen.queryByRole('button', { name: 'My Assignments' })).toBeNull();
  });

  it('offers no My Assignments to a code-joined student', async () => {
    h.claims = {};
    render(<StudentPreviewBanner />);
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: 'My Assignments' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeTruthy();
  });

  it('follows Back from My Assignments to the activity', () => {
    render(
      <StudentPreviewGate loader={null}>
        <div />
      </StudentPreviewGate>
    );
    updateViewAsTabState({ studentPage: 'my-assignments' });
    window.history.replaceState(null, '', '/quiz?viewAs=student');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(getViewAsTabState().studentPage).toBe('activity');
  });
});
