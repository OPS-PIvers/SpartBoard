import React, { useMemo, useState } from 'react';
import { ClipboardPaste, X } from 'lucide-react';
import type { FlashcardCard } from '@/types';
import {
  parseFlashcardText,
  type FlashcardImportSeparator,
} from './utils/flashcardImport';

interface PasteImportDrawerProps {
  onClose: () => void;
  onImport: (cards: FlashcardCard[]) => void;
}

export const PasteImportDrawer: React.FC<PasteImportDrawerProps> = ({
  onClose,
  onImport,
}) => {
  const [source, setSource] = useState('');
  const [separator, setSeparator] = useState<FlashcardImportSeparator>('auto');
  const [customSeparator, setCustomSeparator] = useState('');

  const preview = useMemo(() => {
    try {
      return {
        result: parseFlashcardText(source, { separator, customSeparator }),
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [customSeparator, separator, source]);

  const cards = preview.result?.cards ?? [];

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl"
      style={{ width: '42cqw', maxWidth: '420px' }}
    >
      <header
        className="flex items-center justify-between border-b border-slate-200"
        style={{ padding: 'min(14px, 3cqmin)' }}
      >
        <div className="flex items-center" style={{ gap: 'min(8px, 2cqmin)' }}>
          <ClipboardPaste
            className="text-rose-600"
            style={{ width: 'min(20px, 5cqmin)', height: 'min(20px, 5cqmin)' }}
          />
          <div>
            <h3
              className="font-black text-slate-800"
              style={{ fontSize: 'min(16px, 5cqmin)' }}
            >
              Paste cards
            </h3>
            <p
              className="text-slate-500"
              style={{ fontSize: 'min(11px, 3.5cqmin)' }}
            >
              Paste two columns from Quizlet, Sheets, or a document.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg text-slate-500 hover:bg-slate-100"
          style={{ padding: 'min(6px, 1.5cqmin)' }}
          aria-label="Close paste import"
        >
          <X
            style={{
              width: 'min(18px, 4.5cqmin)',
              height: 'min(18px, 4.5cqmin)',
            }}
          />
        </button>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ gap: 'min(12px, 3cqmin)', padding: 'min(14px, 3cqmin)' }}
      >
        <label className="font-bold text-slate-700">
          <span style={{ fontSize: 'min(11px, 3.5cqmin)' }}>Separator</span>
          <select
            value={separator}
            onChange={(event) =>
              setSeparator(event.target.value as FlashcardImportSeparator)
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-rose-500/30"
            style={{
              padding: 'min(8px, 2cqmin)',
              fontSize: 'min(13px, 4cqmin)',
            }}
          >
            <option value="auto">Auto-detect</option>
            <option value="tab">Tab</option>
            <option value="comma">Comma</option>
            <option value="dash">Space - dash - space</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        {separator === 'custom' && (
          <label className="font-bold text-slate-700">
            <span style={{ fontSize: 'min(11px, 3.5cqmin)' }}>
              Custom separator
            </span>
            <input
              value={customSeparator}
              onChange={(event) => setCustomSeparator(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-rose-500/30"
              style={{
                padding: 'min(8px, 2cqmin)',
                fontSize: 'min(13px, 4cqmin)',
              }}
              placeholder="e.g. ::"
            />
          </label>
        )}

        <label
          className="flex flex-1 flex-col font-bold text-slate-700"
          style={{ minHeight: 'min(140px, 35cqh)' }}
        >
          <span style={{ fontSize: 'min(11px, 3.5cqmin)' }}>
            Terms and definitions
          </span>
          <textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="mt-1 flex-1 resize-none rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-rose-500/30"
            style={{
              minHeight: 'min(120px, 30cqh)',
              padding: 'min(10px, 2.5cqmin)',
              fontSize: 'min(13px, 4cqmin)',
            }}
            placeholder={'hola\thello\nadiós\tgoodbye'}
          />
        </label>

        {preview.error && (
          <p
            className="rounded-xl bg-rose-50 font-medium text-rose-700"
            style={{
              padding: 'min(8px, 2cqmin)',
              fontSize: 'min(11px, 3.5cqmin)',
            }}
          >
            {preview.error}
          </p>
        )}

        {source.trim() && preview.result && (
          <div className="rounded-xl border border-slate-200 bg-slate-50">
            <div
              className="flex items-center justify-between border-b border-slate-200 font-bold text-slate-600"
              style={{
                padding: 'min(8px, 2cqmin)',
                fontSize: 'min(11px, 3.5cqmin)',
              }}
            >
              <span>Preview</span>
              <span>{cards.length} cards</span>
            </div>
            <div
              className="max-h-44 overflow-y-auto"
              style={{ padding: 'min(8px, 2cqmin)' }}
            >
              {cards.slice(0, 8).map((card) => (
                <div
                  key={card.id}
                  className="grid grid-cols-2 border-b border-slate-200 last:border-b-0"
                  style={{
                    gap: 'min(8px, 2cqmin)',
                    paddingBlock: 'min(6px, 1.5cqmin)',
                    fontSize: 'min(11px, 3.5cqmin)',
                  }}
                >
                  <span className="truncate font-bold text-slate-800">
                    {card.term}
                  </span>
                  <span className="truncate text-slate-600">
                    {card.definition}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {preview.result?.note && (
          <p
            className="font-medium text-slate-500"
            style={{ fontSize: 'min(11px, 3.5cqmin)' }}
          >
            {preview.result.note}
          </p>
        )}

        {preview.result?.warnings.map((warning) => (
          <p
            key={warning}
            className="rounded-xl bg-amber-50 font-medium text-amber-800"
            style={{
              padding: 'min(8px, 2cqmin)',
              fontSize: 'min(11px, 3.5cqmin)',
            }}
          >
            {warning}
          </p>
        ))}
      </div>

      <footer
        className="border-t border-slate-200"
        style={{ padding: 'min(12px, 3cqmin)' }}
      >
        <button
          type="button"
          disabled={cards.length === 0}
          onClick={() => {
            onImport(cards);
            onClose();
          }}
          className="w-full rounded-xl bg-rose-600 font-black text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            padding: 'min(10px, 2.5cqmin)',
            fontSize: 'min(12px, 3.8cqmin)',
          }}
        >
          Add {cards.length} card{cards.length === 1 ? '' : 's'}
        </button>
      </footer>
    </aside>
  );
};
