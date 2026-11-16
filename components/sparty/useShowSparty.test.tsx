import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { useShowSparty } from './useShowSparty';

const withAuth = (spartyEnabled: boolean) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthContext.Provider
      value={{ spartyEnabled } as unknown as AuthContextType}
    >
      {children}
    </AuthContext.Provider>
  );
  return Wrapper;
};

describe('useShowSparty', () => {
  it('follows the teacher switch', () => {
    const show = (enabled: boolean) =>
      renderHook(() => useShowSparty(), { wrapper: withAuth(enabled) }).result
        .current;
    expect(show(true)).toBe(true);
    expect(show(false)).toBe(false);
  });

  it('stays hidden outside the auth provider', () => {
    expect(renderHook(() => useShowSparty()).result.current).toBe(false);
  });
});
