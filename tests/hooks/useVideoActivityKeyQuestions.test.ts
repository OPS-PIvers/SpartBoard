import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { doc, getDoc } from 'firebase/firestore';
import { useVideoActivityKeyQuestions } from '@/hooks/useVideoActivityKeyQuestions';
import type { VideoActivityQuestion } from '@/types';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const keyed: VideoActivityQuestion = {
  id: 'q1',
  timeLimit: 0,
  text: 'Capital?',
  type: 'MC',
  timestamp: 3,
  correctAnswer: 'Paris',
  incorrectAnswers: ['Rome'],
  points: 1,
};
const publicQuestions = [
  { id: 'q1', timestamp: 3, text: 'Capital?', type: 'MC' as const },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useVideoActivityKeyQuestions', () => {
  it('uses the questions embedded in a legacy session', () => {
    const { result } = renderHook(() =>
      useVideoActivityKeyQuestions({ id: 's1', questions: [keyed] })
    );
    expect(result.current).toEqual({ questions: [keyed], loading: false });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('loads the key doc for a split session', async () => {
    (getDoc as Mock).mockResolvedValue({
      data: () => ({ questions: [keyed] }),
    });
    const { result } = renderHook(() =>
      useVideoActivityKeyQuestions({ id: 's1', questions: [], publicQuestions })
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.questions[0].correctAnswer).toBe('Paris');
    expect(doc).toHaveBeenCalledWith(
      {},
      'video_activity_sessions',
      's1',
      'key',
      'answers'
    );
  });

  it('degrades to no questions when the key read is refused', async () => {
    (getDoc as Mock).mockRejectedValue(new Error('permission-denied'));
    const { result } = renderHook(() =>
      useVideoActivityKeyQuestions({ id: 's1', questions: [], publicQuestions })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.questions).toEqual([]);
  });
});
