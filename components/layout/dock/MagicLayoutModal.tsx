import React, { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { GlassCard } from '@/components/common/GlassCard';
import { Modal } from '@/components/common/Modal';
import {
  generateDashboardLayout,
  buildPromptWithFileContext,
} from '@/utils/ai';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';

interface MagicLayoutModalProps {
  onClose: () => void;
}

export const MagicLayoutModal: React.FC<MagicLayoutModalProps> = ({
  onClose,
}) => {
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
    if (!description.trim()) return;

    setIsGenerating(true);
    try {
      const fullDescription = buildPromptWithFileContext(
        description,
        fileContext,
        fileName
      );
      const widgets = await generateDashboardLayout(fullDescription);
      addWidgets(widgets);
      addToast('Magic layout generated!', 'success');
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
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg text-white">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
              Magic Layout
            </h3>
            <p className="text-xs text-slate-500">
              Describe your lesson, and AI will set it up.
            </p>
          </div>
        </div>

        <textarea
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
          <p className="text-xxs font-black uppercase tracking-widest text-slate-400 mb-2">
            Try these
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              'Small group rotations with a timer',
              'Morning meeting with weather and calendar',
              'Math lesson with a poll and scratchpad',
            ].map((suggestion) => (
              <button
                key={suggestion}
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
            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
            disabled={isGenerating}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !description.trim()}
            className="flex-[2] py-3 text-xs font-black uppercase tracking-widest text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>Cast Spell</span>
              </>
            )}
          </button>
        </div>
      </GlassCard>
    </Modal>
  );
};
