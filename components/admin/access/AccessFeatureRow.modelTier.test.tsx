import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { GlobalFeaturePermission } from '@/types';
import { AccessFeatureRow } from './AccessFeatureRow';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@test.com' } }),
}));

const permission: GlobalFeaturePermission = {
  featureId: 'paper-handwritten-responses',
  accessLevel: 'admin',
  betaUsers: [],
  enabled: true,
  buildings: [],
  config: { dailyLimit: 300, dailyLimitEnabled: true },
};

const renderRow = (
  featureId: GlobalFeaturePermission['featureId'],
  onUpdate = vi.fn()
) => {
  render(
    <AccessFeatureRow
      featureId={featureId}
      permission={{ ...permission, featureId }}
      isSaved
      isSaving={false}
      hasUnsaved={false}
      onUpdate={onUpdate}
      onSave={vi.fn()}
      showMessage={vi.fn()}
    />
  );
  fireEvent.click(
    document.querySelector(
      `[aria-controls="access-row-${featureId}"]`
    ) as Element
  );
  return onUpdate;
};

describe('AccessFeatureRow model tier', () => {
  it('edits the daily limit and model tier for handwritten answers', () => {
    const onUpdate = renderRow('paper-handwritten-responses');
    expect(screen.getByText('Limit 300/day')).toBeInTheDocument();
    const select = screen.getByLabelText<HTMLSelectElement>('Model');
    expect(select.value).toBe('standard');
    fireEvent.change(select, { target: { value: 'advanced' } });
    expect(onUpdate).toHaveBeenCalledWith({
      config: {
        dailyLimit: 300,
        dailyLimitEnabled: true,
        modelTier: 'advanced',
      },
    });
  });

  it('shows no model picker on other AI features', () => {
    renderRow('smart-poll');
    expect(screen.queryByLabelText('Model')).toBeNull();
  });
});
