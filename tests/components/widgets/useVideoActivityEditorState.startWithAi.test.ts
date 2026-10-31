import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { VideoActivityData } from '@/types';
import { useVideoActivityEditorState } from '@/components/widgets/VideoActivityWidget/components/useVideoActivityEditorState';

const activity = (id: string): VideoActivityData => ({
  id,
  title: 'Imported',
  youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  questions: [],
  createdAt: 1,
  updatedAt: 1,
});

describe('useVideoActivityEditorState — startWithAi (IMPORT.md D35)', () => {
  it('opens the AI prompt for an imported activity and keeps it shut otherwise', () => {
    const imported = renderHook(() =>
      useVideoActivityEditorState({
        activity: activity('a'),
        startWithAi: true,
      })
    );
    expect(imported.result.current.showAiPrompt).toBe(true);
    const plain = renderHook(() =>
      useVideoActivityEditorState({ activity: activity('b') })
    );
    expect(plain.result.current.showAiPrompt).toBe(false);
  });

  it('opens the prompt when the editor switches to an imported activity', () => {
    const { result, rerender } = renderHook(
      (p: { a: VideoActivityData; ai: boolean }) =>
        useVideoActivityEditorState({ activity: p.a, startWithAi: p.ai }),
      { initialProps: { a: activity('x'), ai: false } }
    );
    expect(result.current.showAiPrompt).toBe(false);
    rerender({ a: activity('y'), ai: true });
    expect(result.current.showAiPrompt).toBe(true);
  });
});
