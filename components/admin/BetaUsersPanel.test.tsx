import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BetaUsersPanel } from './BetaUsersPanel';
import type { FeaturePermission, ToolMetadata } from '@/types';
import { Timer } from 'lucide-react';

describe('BetaUsersPanel', () => {
  afterEach(() => {
    cleanup();
  });

  const tool: ToolMetadata = {
    type: 'time-tool',
    icon: Timer,
    label: 'Timer',
    color: 'bg-red-500',
  };

  const permission: FeaturePermission = {
    widgetType: 'time-tool',
    accessLevel: 'beta',
    betaUsers: [],
    enabled: true,
  };

  // Every other "add beta user" call site in the app (GlobalPermissionsManager,
  // BackgroundManager) lowercases the email before persisting it, because
  // downstream consumers (Firestore array-contains queries in
  // CustomWidgetsContext/useBackgrounds, case-sensitive `.includes()` checks in
  // Cloud Functions) rely on betaUsers arrays being stored lowercase. This
  // panel was the one outlier that stored whatever case the admin typed.
  it('stores beta user emails lowercased, matching the rest of the app', () => {
    const updatePermission = vi.fn();
    render(
      <BetaUsersPanel
        tool={tool}
        permission={permission}
        updatePermission={updatePermission}
        showMessage={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('user@example.com');
    fireEvent.change(input, { target: { value: 'Teacher@School.ORG' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updatePermission).toHaveBeenCalledWith('time-tool', {
      betaUsers: ['teacher@school.org'],
    });
  });
});
