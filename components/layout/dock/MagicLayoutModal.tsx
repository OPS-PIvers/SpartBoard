import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { GlassCard } from '@/components/common/GlassCard';
import { Modal } from '@/components/common/Modal';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import {
  generateDashboardLayout,
  buildPromptWithFileContext,
} from '@/utils/ai';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import { useViewAsOutward } from '@/hooks/useViewAsOutward';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

interface MagicLayoutModalProps {
  onClose: () => void;
}

export const MagicLayoutModal: React.FC<MagicLayoutModalProps> = ({
  onClose,
}) => {
  const outward = useViewAsOutward();
  const { addWidgets, addToast } = useDashboard();
  const { canAccessFeature } = useAuth();
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleClose = () => {
    if (!isGenerating) onClose();
  };

  const handleGenerate = async () => {
    if (!description.trim() || outward.locked) return;
    if (outward.active && !(await outward.confirm('Generate with AI'))) return;

    setIsGenerating(true);
    try {
      const fullDescription = buildPromptWithFileContext(
        description,
        fileContext,
        fileName
      );
      const widgets = await generateDashboardLayout(fullDescription);
      addWidgets(widgets);
      addToast('Layout generated!', 'success');
      onClose();
    } catch (error) {
      console.error(error);
      addToast(
        error instanceof Error ? error.message : 'Failed to generate layout',
        'error'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      variant="bare"
      zIndex="z-critical"
    >
      <GlassCard className="w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-brand-blue-primary rounded-xl shadow-sm text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
              Layout Generator
            </h3>
          </div>
        </div>

        <textarea
          {...tourAttr('dock.magic-layout-input')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoFocus
          placeholder="e.g., Math rotations with 4 groups, a 15-minute timer, and a noise meter."
          className="w-full h-32 px-4 py-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-brand-blue-primary text-sm font-medium mb-4 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleGenerate();
            }
          }}
        />

        {canAccessFeature('ai-file-context') && (
          <DriveFileAttachment
            onFileContent={(content, name) => {
              setFileContext(content);
              setFileName(name);
            }}
            disabled={isGenerating}
            className="mb-4"
          />
        )}

        <div className="mb-6">
          <SettingsLabel as="span" id="magic-layout-suggestions-label">
            Try these
          </SettingsLabel>
          <div
            role="group"
            aria-labelledby="magic-layout-suggestions-label"
            className="flex flex-wrap gap-2"
          >
            {[
              'Small group rotations with a timer',
              'Morning meeting with weather and calendar',
              'Math lesson with a poll and scratchpad',
            ].map((suggestion, index) => (
              <button
                key={suggestion}
                {...tourFieldAttr(
                  'dock.magic-layout-suggestion',
                  'magic',
                  String(index)
                )}
                onClick={() => setDescription(suggestion)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xxs font-bold text-slate-600 rounded-lg transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleClose}
            {...tourAttr('dock.magic-layout-cancel')}
            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
            disabled={isGenerating}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            {...tourAttr('dock.magic-layout-apply')}
            disabled={isGenerating || !description.trim() || outward.locked}
            title={outward.lockedTitle}
            className="flex-[2] py-3 text-xs font-black uppercase tracking-widest text-white bg-brand-blue-primary hover:bg-brand-blue-dark rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Draft with AI</span>
              </>
            )}
          </button>
        </div>
      </GlassCard>
    </Modal>
  );
};
