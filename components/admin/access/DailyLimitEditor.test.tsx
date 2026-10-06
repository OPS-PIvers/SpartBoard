import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { GlobalFeaturePermission } from '@/types';
import { DailyLimitEditor } from './AccessFeatureRow';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@test.com' } }),
}));

const permission: GlobalFeaturePermission = {
  featureId: 'smart-poll',
  accessLevel: 'admin',
  betaUsers: [],
  enabled: true,
  buildings: [],
  config: { dailyLimit: 20, dailyLimitEnabled: true },
};

const setup = () => {
  const onUpdate = vi.fn();
  render(
    <DailyLimitEditor
      featureId="smart-poll"
      permission={permission}
      onUpdate={onUpdate}
    />
  );
  const input = screen.getByLabelText<HTMLInputElement>(/uses per day/);
  return { onUpdate, input };
};

describe('DailyLimitEditor', () => {
  it('lets the field be cleared without snapping back to the default', () => {
    const { onUpdate, input } = setup();
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('never saves a limit below 1', () => {
    const { onUpdate, input } = setup();
    fireEvent.change(input, { target: { value: '0' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { dailyLimit: 1, dailyLimitEnabled: true },
    });
  });

  it('never saves a limit above 1000', () => {
    const { onUpdate, input } = setup();
    fireEvent.change(input, { target: { value: '5000' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { dailyLimit: 1000, dailyLimitEnabled: true },
    });
  });

  it('restores the stored limit when left empty', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('20');
  });
});
