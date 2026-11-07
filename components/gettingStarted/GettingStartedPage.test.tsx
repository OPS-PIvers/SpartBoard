import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GettingStartedPage } from './GettingStartedPage';

const { spaNavigate, dialogState } = vi.hoisted(() => ({
  spaNavigate: vi.fn(),
  dialogState: { current: null as null | { id: string } },
}));

vi.mock('@/utils/plcPath', () => ({ spaNavigate }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, isAdmin: false }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm: vi.fn(),
    currentDialog: dialogState.current,
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/components/sparty/useShowSparty', () => ({
  useShowSparty: () => false,
}));
vi.mock('@/components/tours/useCanRunLiveTour', () => ({
  useCanRunLiveTour: () => true,
}));
vi.mock('@/hooks/useGettingStarted', () => ({
  useGettingStarted: () => ({
    loading: false,
    essentials: [],
    nextSteps: [],
    essentialsDone: 0,
    nextEssential: undefined,
  }),
}));

describe('GettingStartedPage', () => {
  beforeEach(() => {
    spaNavigate.mockClear();
    dialogState.current = null;
  });

  it('closes on Escape', () => {
    render(<GettingStartedPage />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(spaNavigate).toHaveBeenCalledWith('/');
  });

  it('leaves Escape to an open confirm dialog', () => {
    dialogState.current = { id: 'dialog-1' };
    render(<GettingStartedPage />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(spaNavigate).not.toHaveBeenCalled();
  });
});
