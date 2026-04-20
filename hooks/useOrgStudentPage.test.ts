import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useOrgStudentPage } from './useOrgStudentPage';
import { useAuth } from '@/context/useAuth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { StudentPageConfig } from '@/types/organization';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockStudentPage: StudentPageConfig = {
  orgId: 'orono',
  showAnnouncements: true,
  showTeacherDirectory: true,
  showLunchMenu: false,
  accentColor: '#2d3f89',
  heroText: 'Welcome Spartans',
};

describe('useOrgStudentPage', () => {
  const mockUseAuth = useAuth as Mock;
  const mockDoc = doc as Mock;
  const mockOnSnapshot = onSnapshot as Mock;
  const mockSetDoc = setDoc as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockSetDoc.mockResolvedValue(undefined);
  });

  it('skips subscription when orgId is null', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    const { result } = renderHook(() => useOrgStudentPage(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.studentPage).toBeNull();
  });

  it('hydrates config from snapshot', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        onNext: (snap: {
          exists: () => boolean;
          data: () => StudentPageConfig;
        }) => void
      ) => {
        queueMicrotask(() =>
          onNext({ exists: () => true, data: () => mockStudentPage })
        );
        return () => undefined;
      }
    );

    const { result } = renderHook(() => useOrgStudentPage('orono'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.studentPage?.heroText).toBe('Welcome Spartans');
    });
  });

  it('updateStudentPage upserts the config doc with merge + canonical orgId', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgStudentPage('orono'));

    await act(async () => {
      await result.current.updateStudentPage({
        orgId: 'ignored',
        heroText: 'Go Spartans!',
        showLunchMenu: true,
      });
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, payload, options] = mockSetDoc.mock.calls[0] as [
      string,
      unknown,
      unknown,
    ];
    expect(ref).toBe('organizations/orono/studentPageConfig/default');
    expect(payload).toEqual({
      orgId: 'orono',
      heroText: 'Go Spartans!',
      showLunchMenu: true,
    });
    expect(options).toEqual({ merge: true });
  });

  it('updateStudentPage rejects when orgId is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOrgStudentPage(null));
    await expect(result.current.updateStudentPage({})).rejects.toThrow(
      /No organization/
    );
  });
});
