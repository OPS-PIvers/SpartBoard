import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Wand2, Loader2 } from 'lucide-react';
import { GlassCard } from '../../common/GlassCard';
import { generateDashboardLayout } from '../../../utils/ai';
import { useDashboard } from '../../../context/useDashboard';

interface MagicLayoutModalProps {
  onClose: () => void;
}

export const MagicLayoutModal: React.FC<MagicLayoutModalProps> = ({
  onClose,
}) => {
  const { addWidgets, addToast } = useDashboard();
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isGenerating]);

  const handleGenerate = async () => {
    if (!description.trim()) return;

    setIsGenerating(true);
    try {
      const widgets = await generateDashboardLayout(description);
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

  return createPortal(
    <div className="fixed inset-0 z-critical flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
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
          className="w-full h-32 px-4 py-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-purple-500 text-sm font-medium mb-4 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleGenerate();
            }
          }}
        />

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
            onClick={onClose}
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
    </div>,
    document.body
  );
};
