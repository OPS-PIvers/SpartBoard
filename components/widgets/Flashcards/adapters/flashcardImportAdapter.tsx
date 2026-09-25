import React from 'react';
import type { ImportAdapter } from '@/components/common/library';
import type { FlashcardCard } from '@/types';
import {
  parseFlashcardSheetRows,
  parseFlashcardText,
} from '@/components/widgets/Flashcards/utils/flashcardImport';

export interface FlashcardImportData {
  cards: FlashcardCard[];
}

interface FlashcardImportAdapterDeps {
  loadSheet: (url: string) => Promise<string[][]>;
  pickSheet: () => Promise<{ url: string } | null>;
  save: (cards: FlashcardCard[], title: string) => Promise<void>;
}

export function createFlashcardImportAdapter(
  deps: FlashcardImportAdapterDeps
): ImportAdapter<FlashcardImportData> {
  return {
    widgetLabel: 'Flashcards',
    supportedSources: ['sheet', 'csv'],
    pickSheet: deps.pickSheet,
    parse: async (source) => {
      if (source.kind === 'csv') {
        const parsed = parseFlashcardText(source.text);
        return {
          data: { cards: parsed.cards },
          warnings: parsed.warnings,
          note: parsed.note,
        };
      }
      if (source.kind === 'sheet') {
        const parsed = parseFlashcardSheetRows(
          await deps.loadSheet(source.url)
        );
        return {
          data: { cards: parsed.cards },
          warnings: parsed.warnings,
          note: parsed.note,
        };
      }
      throw new Error('Flashcards import accepts CSV files or Google Sheets.');
    },
    validate: (data) => ({
      ok: data.cards.length > 0,
      errors:
        data.cards.length > 0
          ? []
          : ['No complete term and definition pairs were found.'],
    }),
    renderPreview: (data) => (
      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-700">
          {data.cards.length} card{data.cards.length === 1 ? '' : 's'} ready
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          {data.cards.slice(0, 20).map((card, index) => (
            <div
              key={card.id}
              className="grid grid-cols-[2rem_1fr_1fr] gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-xs"
            >
              <span className="font-bold text-slate-300">{index + 1}.</span>
              <span className="truncate font-bold text-slate-800">
                {card.term}
              </span>
              <span className="truncate text-slate-600">{card.definition}</span>
            </div>
          ))}
          {data.cards.length > 20 && (
            <p className="text-center text-xs font-medium text-slate-400">
              + {data.cards.length - 20} more cards
            </p>
          )}
        </div>
      </div>
    ),
    save: (data, title) => deps.save(data.cards, title),
  };
}
