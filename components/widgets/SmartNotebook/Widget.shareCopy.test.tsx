import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach, Mock } from 'vitest';
import { SmartNotebookWidget } from './Widget';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useStorage } from '@/hooks/useStorage';
import * as firestore from 'firebase/firestore';
import { WidgetData } from '@/types';

vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useStorage');
vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useNotebookSharing', () => ({
  useNotebookSharing: () => ({
    shareNotebook: vi.fn().mockResolvedValue('https://x.test/share/abc'),
  }),
}));

vi.mock('@/hooks/useSharedBoardItem', () => ({
  useSharedBoardItem: () => ({ status: 'off', item: null }),
  useSharedBoardItemPublisher: () => undefined,
}));
vi.mock('@/context/dashboardCanvasStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/dashboardCanvasStore')>()),
  useActiveBoardLinkedShareId: () => null,
}));

const widget = {
  id: 'w1',
  type: 'smartNotebook',
  config: { activeNotebookId: null, storageLimitMb: 50 },
  w: 600,
  h: 500,
  x: 0,
  y: 0,
  z: 0,
  flipped: false,
} as WidgetData;

describe('SmartNotebook share copy', () => {
  const addToast = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    (useAuth as unknown as Mock).mockReturnValue({
      user: { uid: 'u' },
      canAccessFeature: () => false,
    });
    (useDashboard as unknown as Mock).mockReturnValue({
      updateWidget: vi.fn(),
      addToast,
    });
    (useStorage as unknown as Mock).mockReturnValue({ uploadFile: vi.fn() });
    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_q: unknown, cb: (s: { docs: unknown[] }) => void) => {
        cb({
          docs: [
            {
              id: 'nb1',
              data: () => ({
                title: 'Lesson',
                pageUrls: ['a.svg'],
                createdAt: 1,
              }),
            },
          ],
        });
        return vi.fn();
      }
    );
  });

  it('does not report a failed share when only the clipboard write is blocked', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<SmartNotebookWidget widget={widget} />);
    fireEvent.click(screen.getAllByLabelText('Share notebook')[0]);
    await waitFor(() => expect(addToast).toHaveBeenCalled());
    const msgs = addToast.mock.calls.map((c) => String(c[0]));
    expect(msgs.some((m) => m.includes('Failed to create share link'))).toBe(
      false
    );
    expect(addToast).toHaveBeenCalledWith(
      'Share link created but not copied: https://x.test/share/abc',
      'info'
    );
  });
});
