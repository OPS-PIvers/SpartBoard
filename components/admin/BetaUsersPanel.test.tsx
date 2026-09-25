import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BetaUsersPanel } from './BetaUsersPanel';

describe('BetaUsersPanel', () => {
  afterEach(() => {
    cleanup();
  });

  // Every other "add beta user" call site in the app (GlobalPermissionsManager,
  // BackgroundManager) lowercases the email before persisting it, because
  // downstream consumers (Firestore array-contains queries in
  // CustomWidgetsContext/useBackgrounds, case-sensitive `.includes()` checks in
  // Cloud Functions) rely on betaUsers arrays being stored lowercase. This
  // panel was the one outlier that stored whatever case the admin typed.
  it('stores beta user emails lowercased, matching the rest of the app', () => {
    const onChange = vi.fn();
    render(
      <BetaUsersPanel
        betaUsers={[]}
        onChange={onChange}
        showMessage={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('user@example.com');
    fireEvent.change(input, { target: { value: 'Teacher@School.ORG' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['teacher@school.org']);
  });
});
