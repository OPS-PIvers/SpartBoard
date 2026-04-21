import React, { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { Sparkles, Wrench, Plus, HelpCircle, Loader2 } from 'lucide-react';

interface GeminiPanelProps {
  onGenerate: (code: string) => void;
  currentCode: string;
}

type ActionMode = 'generate' | 'fix' | 'add' | 'explain';

function buildPrompt(
  action: ActionMode,
  description: string,
  currentCode: string
): string {
  switch (action) {
    case 'generate':
      return `Create a complete self-contained HTML widget for a classroom dashboard. The widget should: ${description}. Requirements: Use vanilla HTML/CSS/JS only. Make it visually appealing with a modern design. Use a dark background (#1e293b) with light text. Include all styles inline. The widget must work in a sandboxed iframe. Make buttons and interactive elements large enough for tablet use. Output ONLY the complete HTML code, nothing else.`;
    case 'fix':
      return `Here is HTML widget code that may have errors. Fix any JavaScript or CSS errors and make it work correctly. Current code:\n${currentCode}\n\nOutput ONLY the fixed HTML code, nothing else.`;
    case 'add':
      return `Here is an HTML widget. Add this feature: ${description}. Current code:\n${currentCode}\n\nOutput ONLY the complete updated HTML code, nothing else.`;
    case 'explain':
      return `Explain what this HTML widget does in simple terms (1-2 sentences, no code jargon). Code:\n${currentCode}`;
  }
}

function extractCode(text: string): string {
  // Try to extract from markdown code blocks first
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  // If it starts with <!DOCTYPE or <html, return as-is
  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return trimmed;
  }
  return text.trim();
}

async function callGemini(
  type: 'widget-builder' | 'widget-explainer',
  prompt: string
): Promise<string> {
  const generate = httpsCallable<
    { type: string; prompt: string },
    { result: string }
  >(functions, 'generateWithAI');
  const response = await generate({ type, prompt });
  return response.data.result;
}

export const GeminiPanel: React.FC<GeminiPanelProps> = ({
  onGenerate,
  currentCode,
}) => {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState('');
  const [error, setError] = useState('');

  const handleAction = useCallback(
    async (action: ActionMode) => {
      if (loading) return;
      if ((action === 'generate' || action === 'add') && !description.trim()) {
        setError(
          action === 'generate'
            ? 'Please describe what you want the widget to do.'
            : 'Please describe the feature you want to add.'
        );
        return;
      }

      setLoading(true);
      setError('');
      setResultText('');

      try {
        const prompt = buildPrompt(action, description.trim(), currentCode);
        const raw = await callGemini(
          action === 'explain' ? 'widget-explainer' : 'widget-builder',
          prompt
        );

        if (action === 'explain') {
          setResultText(raw);
        } else {
          const code = extractCode(raw);
          onGenerate(code);
          setResultText(
            action === 'generate'
              ? 'Widget generated! Review the code in the editor.'
              : action === 'fix'
                ? 'Errors fixed! Review the updated code.'
                : 'Feature added! Review the updated code.'
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'An unexpected error occurred.'
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, description, currentCode, onGenerate]
  );

  return (
    <div className="flex flex-col h-full bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="px-3 py-2 bg-slate-700 border-b border-slate-600 flex items-center gap-2">
        <Sparkles size={14} className="text-brand-blue-light" />
        <span className="text-xs font-semibold text-slate-200">
          AI Assistant
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-3 p-3 overflow-auto">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what you want this widget to do..."
          className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-brand-blue-light transition-colors"
          rows={3}
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleAction('generate')}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
          >
            <Sparkles size={12} />
            Generate
          </button>
          <button
            onClick={() => handleAction('fix')}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
          >
            <Wrench size={12} />
            Fix Errors
          </button>
          <button
            onClick={() => handleAction('add')}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
          >
            <Plus size={12} />
            Add Feature
          </button>
          <button
            onClick={() => handleAction('explain')}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
          >
            <HelpCircle size={12} />
            Explain
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin text-purple-400" />
            Thinking...
          </div>
        )}

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {resultText && !error && (
          <div className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-xs text-slate-300 whitespace-pre-wrap">
            {resultText}
          </div>
        )}
      </div>
    </div>
  );
};
