import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { GlobalFeaturePermission } from '@/types';
import { InputSignsEditor } from './AccessFeatureRow';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@test.com' } }),
}));

const permission = (
  config?: Record<string, unknown>
): GlobalFeaturePermission => ({
  featureId: 'input-signals',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config,
});

const setup = (config?: Record<string, unknown>) => {
  const onUpdate = vi.fn();
  render(
    <InputSignsEditor permission={permission(config)} onUpdate={onUpdate} />
  );
  return onUpdate;
};

describe('InputSignsEditor', () => {
  it('shows every sign on with the default wording when nothing is saved', () => {
    setup();
    expect(
      screen.getByRole('switch', {
        name: 'Pasted text shown to teachers',
      })
    ).toBeChecked();
    expect(
      screen.getByLabelText<HTMLInputElement>('Pasted text: could also be')
        .value
    ).toBe('Moving their own text between answers.');
    expect(
      screen.queryByLabelText('Writing playback: could also be')
    ).toBeNull();
  });

  it('switching a sign off saves only that sign and keeps other config', () => {
    const onUpdate = setup({ dailyLimit: 5 });
    fireEvent.click(
      screen.getByRole('switch', { name: 'Pasted text shown to teachers' })
    );
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { dailyLimit: 5, signs: { pasted: { off: true } } },
    });
  });

  it('saves edited wording and drops it when set back to the default', () => {
    const onUpdate = setup();
    const box = screen.getByLabelText('Pasted text: could also be');
    fireEvent.change(box, { target: { value: 'Notes they wrote earlier.' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: {
        signs: { pasted: { otherCauses: 'Notes they wrote earlier.' } },
      },
    });
    fireEvent.change(box, {
      target: { value: 'Moving their own text between answers.' },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({ config: { signs: {} } });
  });

  it('lets a box be cleared while typing without snapping back', () => {
    const onUpdate = setup({
      signs: { pasted: { otherCauses: 'Old wording.' } },
    });
    const box = screen.getByLabelText<HTMLInputElement>(
      'Pasted text: could also be'
    );
    fireEvent.change(box, { target: { value: '' } });
    expect(box.value).toBe('');
    expect(onUpdate).toHaveBeenLastCalledWith({ config: { signs: {} } });
  });
});
