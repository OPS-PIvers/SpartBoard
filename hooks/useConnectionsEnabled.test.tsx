import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import { SubShareHostContext } from '@/context/SubShareHostContextValue';
import { useConnectionsEnabled } from './useConnectionsEnabled';

const auth = {} as AuthContextType;

describe('useConnectionsEnabled', () => {
  it('is on in the teacher app', () => {
    const { result } = renderHook(useConnectionsEnabled, {
      wrapper: ({ children }) => (
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      ),
    });
    expect(result.current).toBe(true);
  });

  it('is off in the sub portal, which runs no Connections', () => {
    const { result } = renderHook(useConnectionsEnabled, {
      wrapper: ({ children }) => (
        <AuthContext.Provider value={auth}>
          <SubShareHostContext.Provider value={{ teacherName: null }}>
            {children}
          </SubShareHostContext.Provider>
        </AuthContext.Provider>
      ),
    });
    expect(result.current).toBe(false);
  });

  it('is off without the teacher app', () => {
    expect(renderHook(useConnectionsEnabled).result.current).toBe(false);
  });
});
