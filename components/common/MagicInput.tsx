import React, { useState } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { useViewAsOutward } from '@/hooks/useViewAsOutward';

interface MagicInputProps<T> {
  /** Async function to call when generating. Should return the result. */
  onGenerate: (prompt: string) => Promise<T>;
  /** Callback with the result on success. */
  onSuccess: (result: T) => void;
  /** Placeholder text for the input. */
  placeholder?: string;
  /** Label for the button. Defaults to "Generate". */
  buttonLabel?: string;
}

/**
 * A reusable component for AI generation inputs.
 * Includes an input field, a generation button with loading state, and error handling.
 */
export const MagicInput = <T,>({
  onGenerate,
  onSuccess,
  placeholder = 'Describe what you want...',
  buttonLabel = 'Generate',
}: MagicInputProps<T>) => {
  const outward = useViewAsOutward();
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || outward.locked) return;
    if (outward.active && !(await outward.confirm('Generate with AI'))) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await onGenerate(prompt);
      onSuccess(result);
      setPrompt(''); // Clear input on success
    } catch (err) {
      // Extract error message safely
      let message = 'Generation failed. Please try again.';
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleGenerate();
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="relative flex items-center">
        <div className="absolute left-3 text-brand-blue-primary pointer-events-none">
          <Sparkles size={16} />
        </div>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className="w-full pl-9 pr-24 py-2.5 text-sm bg-brand-blue-lighter/50 border border-brand-blue-lighter rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/50 focus:border-brand-blue-primary transition-[border-color,box-shadow] placeholder:text-brand-blue-light text-slate-700"
        />
        <button
          onClick={handleGenerate}
          disabled={isLoading || !prompt.trim() || outward.locked}
          title={outward.lockedTitle}
          className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-brand-blue-light text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
        >
          {isLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <span>{buttonLabel}</span>
          )}
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-500 animate-in slide-in-from-top-1">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
