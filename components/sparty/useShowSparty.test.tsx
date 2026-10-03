import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { useShowSparty } from './useShowSparty';

const withAuth = (spartyEnabled: boolean, canAccess: boolean) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthContext.Provider
      value={
        {
          spartyEnabled,
          canAccessFeature: (id: string) => id === 'sparty' && canAccess,
        } as unknown as AuthContextType
      }
    >
      {children}
    </AuthContext.Provider>
  );
  return Wrapper;
};

describe('useShowSparty', () => {
  it('needs both the feature and the teacher switch', () => {
    const show = (enabled: boolean, access: boolean) =>
      renderHook(() => useShowSparty(), { wrapper: withAuth(enabled, access) })
        .result.current;
    expect(show(true, true)).toBe(true);
    expect(show(false, true)).toBe(false);
    expect(show(true, false)).toBe(false);
  });

  it('stays hidden outside the auth provider', () => {
    expect(renderHook(() => useShowSparty()).result.current).toBe(false);
  });
});
