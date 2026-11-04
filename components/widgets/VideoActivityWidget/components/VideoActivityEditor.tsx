// The Video Activity editor's Draft with AI overlay, mounted by VideoActivityEditorModal.

import React from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { AIGeneratorOverlay } from '@/components/common/AIGeneratorOverlay';
import type { VideoActivityEditorController } from './useVideoActivityEditorState';

// ─── AI overlay ──────────────────────────────────────────────────────────────

interface AiOverlayProps {
  state: VideoActivityEditorController;
}

const VIDEO_TYPE_STEPPER_ROWS: ReadonlyArray<{
  type: 'MC' | 'FIB' | 'MA';
  label: string;
  hint: string;
}> = [
  {
    type: 'MC',
    label: 'Multiple Choice',
    hint: 'One correct answer + 3 distractors',
  },
  {
    type: 'FIB',
    label: 'Fill in the Blank',
    hint: 'Student types a short answer',
  },
  {
    type: 'MA',
    label: 'Multi-Answer',
    hint: 'Student selects all correct options',
  },
];

export const VideoActivityAiOverlay: React.FC<AiOverlayProps> = ({ state }) => {
  const {
    showAiPrompt,
    setShowAiPrompt,
    aiTypeCounts,
    setAiTypeCount,
    aiTotalCount,
    aiGenerating,
    aiError,
    runAiGenerate,
    youtubeUrl,
  } = state;

  return (
    <AIGeneratorOverlay
      open={showAiPrompt}
      onClose={() => setShowAiPrompt(false)}
      title="Draft with AI"
      description="Adds questions to the end of the list."
      generating={aiGenerating}
      canGenerate={!!youtubeUrl.trim() && aiTotalCount > 0}
      onGenerate={() => void runAiGenerate()}
      error={aiError}
      generateLabel="Generate Questions"
      closeAnchor={tourAttr('video-activity.editor-ai-close')}
      generateAnchor={tourAttr('video-activity.editor-ai-generate')}
    >
      <div>
        <div className="flex items-center justify-between text-xxs font-black text-slate-400 uppercase tracking-widest mb-1">
          <span>Question Mix</span>
          <span>Total: {aiTotalCount}</span>
        </div>
        <ul className="divide-y divide-slate-100 border-y border-slate-200">
          {VIDEO_TYPE_STEPPER_ROWS.map((row) => {
            const value = aiTypeCounts[row.type];
            return (
              <li key={row.type} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-700">
                    {row.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {row.hint}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    {...tourFieldAttr(
                      'video-activity.ai-count-decrement',
                      'video-activity',
                      row.type
                    )}
                    type="button"
                    onClick={() => setAiTypeCount(row.type, value - 1)}
                    disabled={value <= 0 || aiGenerating}
                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Decrease ${row.label} count`}
                  >
                    –
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-slate-800 tabular-nums">
                    {value}
                  </span>
                  <button
                    {...tourFieldAttr(
                      'video-activity.ai-count-increment',
                      'video-activity',
                      row.type
                    )}
                    type="button"
                    onClick={() => setAiTypeCount(row.type, value + 1)}
                    disabled={value >= 15 || aiGenerating}
                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Increase ${row.label} count`}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </AIGeneratorOverlay>
  );
};
