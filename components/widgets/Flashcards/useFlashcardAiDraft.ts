import { useState } from 'react';
import type { FlashcardCard } from '@/types';
import { buildPromptWithFileContext, generateFlashcards } from '@/utils/ai';

export const AI_CARD_COUNT_DEFAULT = 10;
export const AI_CARD_COUNT_MAX = 50;

interface UseFlashcardAiDraftOptions {
  onDrafted: (cards: FlashcardCard[], title: string) => void;
}

/** Draft with AI state for the set editor. */
export const useFlashcardAiDraft = ({
  onDrafted,
}: UseFlashcardAiDraftOptions) => {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [count, setCountRaw] = useState(AI_CARD_COUNT_DEFAULT);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFileState] = useState<{
    content: string;
    name: string;
  } | null>(null);
  const [extracting, setExtracting] = useState(false);

  const setCount = (next: number): void =>
    setCountRaw(
      Math.max(1, Math.min(AI_CARD_COUNT_MAX, Math.floor(next) || 1))
    );

  const generate = async (): Promise<void> => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateFlashcards(
        buildPromptWithFileContext(
          prompt,
          file?.content ?? null,
          file?.name ?? null
        ),
        count
      );
      onDrafted(
        result.cards.map((card) => ({
          id: crypto.randomUUID(),
          term: card.term.trim(),
          definition: card.definition.trim(),
        })),
        result.title.trim()
      );
      setOpen(false);
      setPrompt('');
      setFileState(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to draft flashcards. Please try again.'
      );
    } finally {
      setGenerating(false);
    }
  };

  return {
    open,
    setOpen,
    prompt,
    setPrompt,
    count,
    setCount,
    generating,
    error,
    setFile: (content: string | null, name: string | null) =>
      setFileState(content ? { content, name: name ?? '' } : null),
    extracting,
    setExtracting,
    generate,
  };
};

export type FlashcardAiDraft = ReturnType<typeof useFlashcardAiDraft>;
