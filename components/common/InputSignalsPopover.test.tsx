import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { InputSignals } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { InputSignalsBadge } from './InputSignalsPopover';

const auth = {
  canAccessFeature: () => true,
  isAdmin: false,
  globalPermissions: [],
} as unknown as React.ContextType<typeof AuthContext>;

const renderBadge = (signals: InputSignals) => {
  let tone = '';
  render(
    <AuthContext.Provider value={auth}>
      <InputSignalsBadge
        signals={signals}
        completedAttempts={1}
        completed
        studentName="Avery"
      >
        {(count, deviceOnly) => {
          tone = deviceOnly ? 'device' : 'input';
          return <span>{count}</span>;
        }}
      </InputSignalsBadge>
    </AuthContext.Provider>
  );
  fireEvent.click(screen.getByRole('button'));
  return tone;
};

describe('InputSignalsBadge', () => {
  it('shows a second screen alone as a neutral device detail', () => {
    expect(renderBadge({ '0': { _: { extraScreen: 1 } } })).toBe('device');
    expect(screen.getByText('Device details')).toBeTruthy();
    expect(screen.queryByText(/another app/)).toBeNull();
  });

  it('keeps Unusual input when any sign is about how answers were entered', () => {
    expect(
      renderBadge({
        '0': { _: { extraScreen: 1 }, q1: { pastes: 1, pastedChars: 40 } },
      })
    ).toBe('input');
    expect(screen.getByText('Unusual input')).toBeTruthy();
  });

  it('lists dictated characters as a plain line, never as a sign', () => {
    renderBadge({
      '0': {
        q1: { pastes: 1, pastedChars: 40, dictatedChars: 1200 },
        q2: { dictatedChars: 34 },
      },
    });
    expect(screen.getByText('Dictated characters: 1,234')).toBeTruthy();
    expect(screen.getByText('1 sign')).toBeTruthy();
  });
});
