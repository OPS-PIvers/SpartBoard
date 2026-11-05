import React from 'react';
import { AIGeneratorOverlay } from '@/components/common/AIGeneratorOverlay';
import { AI_PROMPT_TEXTAREA_CLASS } from '@/components/common/aiPanelStyles';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import { useAuth } from '@/context/useAuth';
import { tourTypeAttr } from '@/config/tourAnchors';
import {
  AI_CARD_COUNT_MAX,
  type FlashcardAiDraft,
} from './useFlashcardAiDraft';

export const FlashcardAiOverlay: React.FC<{ draft: FlashcardAiDraft }> = ({
  draft,
}) => {
  const { canAccessFeature } = useAuth();
  return (
    <AIGeneratorOverlay
      open={draft.open}
      onClose={() => draft.setOpen(false)}
      title="Draft with AI"
      description="New cards are added to the end. This counts toward your daily AI limit."
      generating={draft.generating}
      canGenerate={!!draft.prompt.trim() && !draft.extracting}
      onGenerate={() => void draft.generate()}
      error={draft.error}
      generateLabel="Generate Cards"
      closeAnchor={tourTypeAttr('flashcards-editor.ai-close', 'flashcards')}
      generateAnchor={tourTypeAttr(
        'flashcards-editor.ai-generate',
        'flashcards'
      )}
    >
      <textarea
        value={draft.prompt}
        onChange={(event) => draft.setPrompt(event.target.value)}
        placeholder="e.g. Parts of a cell for 7th graders."
        className={`${AI_PROMPT_TEXTAREA_CLASS} h-24!`}
        autoFocus
        aria-label="Describe your cards"
        {...tourTypeAttr('flashcards-editor.ai-prompt', 'flashcards')}
      />
      <div className="flex items-center justify-between gap-3 border-y border-slate-200 py-2">
        <span className="text-sm font-bold text-slate-700">Cards</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => draft.setCount(draft.count - 1)}
            disabled={draft.count <= 1 || draft.generating}
            className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Decrease card count"
            {...tourTypeAttr('flashcards-editor.ai-count-dec', 'flashcards')}
          >
            –
          </button>
          <span className="w-6 text-center text-sm font-bold text-slate-800 tabular-nums">
            {draft.count}
          </span>
          <button
            type="button"
            onClick={() => draft.setCount(draft.count + 1)}
            disabled={draft.count >= AI_CARD_COUNT_MAX || draft.generating}
            className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Increase card count"
            {...tourTypeAttr('flashcards-editor.ai-count-inc', 'flashcards')}
          >
            +
          </button>
        </div>
      </div>
      {canAccessFeature('ai-file-context') && (
        <DriveFileAttachment
          onFileContent={(content, name) => draft.setFile(content, name)}
          onExtractingChange={draft.setExtracting}
          disabled={draft.generating}
          anchor={tourTypeAttr(
            'flashcards-editor.ai-attach-file',
            'flashcards'
          )}
        />
      )}
    </AIGeneratorOverlay>
  );
};
