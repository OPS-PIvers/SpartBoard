import React, { useState } from 'react';
import { WidgetData, SyntaxFramerConfig, SyntaxToken } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import {
  Type,
  Calculator,
  AlignLeft,
  AlignCenter,
  ALargeSmall,
} from 'lucide-react';

interface SyntaxFramerSettingsProps {
  widget: WidgetData;
}

export const SyntaxFramerSettings: React.FC<SyntaxFramerSettingsProps> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as SyntaxFramerConfig;

  // Derive initial input from existing tokens
  const initialInput = config.tokens
    .map((t) => t.value)
    .join(config.mode === 'text' ? ' ' : '');
  const [inputText, setInputText] = useState(initialInput);

  const handleUpdate = (updates: Partial<SyntaxFramerConfig>) => {
    updateWidget(widget.id, {
      config: { ...config, ...updates },
    });
  };

  const retokenize = (text: string, mode: 'text' | 'math'): SyntaxToken[] => {
    let newTokens: SyntaxToken[] = [];
    if (mode === 'text') {
      const words = text.split(/\s+/).filter(Boolean);
      newTokens = words.map((w) => ({
        id: crypto.randomUUID(),
        value: w,
        isMasked: false,
      }));
    } else {
      const parts = text
        .split(/([+\-*/=()^]|\s+)/)
        .filter((p) => p.trim() !== '');
      newTokens = parts.map((p) => ({
        id: crypto.randomUUID(),
        value: p,
        isMasked: false,
      }));
    }

    // Track usage to allow duplicate tokens (e.g. multiple "x" variables) to map correctly in sequence
    const usedExistingTokenIds = new Set<string>();

    return newTokens.map((newToken) => {
      const existingToken = config.tokens.find(
        (t) => t.value === newToken.value && !usedExistingTokenIds.has(t.id)
      );
      if (existingToken) {
        usedExistingTokenIds.add(existingToken.id);
        return {
          ...newToken,
          id: existingToken.id, // Preserve ID to avoid unnecessary re-renders or DnD drops
          color: existingToken.color,
          isMasked: existingToken.isMasked,
        };
      }
      return newToken;
    });
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);
    handleUpdate({ tokens: retokenize(text, config.mode) });
  };

  const handleModeChange = (mode: 'text' | 'math') => {
    handleUpdate({ mode, tokens: retokenize(inputText, mode) });
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsLabel icon={Type}>Content</SettingsLabel>
        <div className="mb-4">
          <textarea
            className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
            rows={3}
            placeholder={
              config.mode === 'text'
                ? 'Enter a sentence...'
                : 'Enter an equation (e.g. 2x + 3 = 7)'
            }
            value={inputText}
            onChange={handleTextChange}
          />
          <p className="text-xs text-slate-500 mt-1">
            {config.mode === 'text'
              ? 'Words are automatically converted to draggable blocks.'
              : 'Numbers and math operators are separated into blocks.'}
          </p>
        </div>
      </div>

      <div>
        <SettingsLabel icon={Calculator}>Mode</SettingsLabel>
        <div className="flex gap-2 mb-4">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
              config.mode === 'text'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => handleModeChange('text')}
          >
            <Type className="w-4 h-4" />
            Text
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
              config.mode === 'math'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => handleModeChange('math')}
          >
            <Calculator className="w-4 h-4" />
            Math
          </button>
        </div>
      </div>

      <div>
        <SettingsLabel icon={ALargeSmall}>Appearance</SettingsLabel>
        <div className="space-y-4 mb-4">
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span>Font Size</span>
              <span>{config.fontSize ?? 8}</span>
            </div>
            <input
              type="range"
              min="2"
              max="24"
              step="0.5"
              value={config.fontSize ?? 8}
              onChange={(e) =>
                handleUpdate({ fontSize: parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </div>

          <div>
            <span className="text-xs text-slate-500 mb-2 block">Alignment</span>
            <div className="flex gap-2">
              <button
                className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg border transition-colors ${
                  config.alignment === 'left'
                    ? 'bg-slate-100 border-slate-300 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
                onClick={() => handleUpdate({ alignment: 'left' })}
              >
                <AlignLeft className="w-4 h-4" />
              </button>
              <button
                className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg border transition-colors ${
                  config.alignment === 'center'
                    ? 'bg-slate-100 border-slate-300 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
                onClick={() => handleUpdate({ alignment: 'center' })}
              >
                <AlignCenter className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg flex gap-2">
        <div className="flex-1">
          <strong>Tip:</strong> Shift+Click a token on the board to change its
          color. Click normally to mask it with blanks.
        </div>
      </div>
    </div>
  );
};

export default SyntaxFramerSettings;
