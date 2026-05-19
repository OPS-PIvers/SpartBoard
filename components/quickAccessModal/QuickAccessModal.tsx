import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Search, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useDashboard } from '@/context/useDashboard';
import { TOOLS } from '@/config/tools';
import type { WidgetType, InternalToolType } from '@/types';

const MAX_SLOTS = 2;

/**
 * Tool types that live in TOOLS for dock/library use but cannot be added to
 * Quick Access. Only `remote` is excluded — it's not a real `WidgetType` and
 * the dock's QuickAccessButton onClick handler has no branch for it.
 *
 * `record` and `magic` ARE first-class Quick Access types: the dock's
 * onClick handler in `components/layout/Dock.tsx` explicitly special-cases
 * both (record → start/stopRecording; magic → setShowMagicLayout(true)).
 * Excluding them here would also strand any dashboard that already has
 * them in `quickAccessWidgets` — the user would see no way to deselect.
 */
const INTERNAL_TOOL_TYPES = new Set<string>(['remote']);

interface QuickAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickAccessModal: React.FC<QuickAccessModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { activeDashboard, updateDashboardSettings } = useDashboard();
  const [query, setQuery] = useState('');

  const selected = activeDashboard?.settings?.quickAccessWidgets ?? [];

  const visibleTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Exclude internal tools that can't be added as widgets from Quick Access
    const pickable = TOOLS.filter(
      (tool) => !INTERNAL_TOOL_TYPES.has(tool.type)
    );
    if (!q) return pickable;
    return pickable.filter((tool) => tool.label.toLowerCase().includes(q));
  }, [query]);

  const handleToggle = (type: WidgetType | InternalToolType) => {
    let next: (WidgetType | InternalToolType)[];
    if (selected.includes(type)) {
      next = selected.filter((s) => s !== type);
    } else if (selected.length < MAX_SLOTS) {
      next = [...selected, type];
    } else {
      return; // full, do nothing
    }
    updateDashboardSettings({ quickAccessWidgets: next });
  };

  const customHeader = (
    <div className="flex items-center justify-between p-6 pb-4 shrink-0 border-b border-slate-100">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
          <Zap className="w-4 h-4 text-amber-500" />
        </div>
        <h3
          id="quick-access-modal-title"
          className="font-black text-lg text-slate-800"
        >
          {t('quickAccess.title', { defaultValue: 'Quick Access Widgets' })}
        </h3>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xxs font-bold text-slate-500 uppercase tracking-widest">
          <span>
            {selected.length}/{MAX_SLOTS}
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: MAX_SLOTS }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < selected.length ? 'bg-brand-blue-primary' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-3xl"
      className="h-[75vh]"
      contentClassName="px-0 pb-0 flex flex-col"
      customHeader={customHeader}
      ariaLabelledby="quick-access-modal-title"
    >
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 p-4">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('quickAccess.searchPlaceholder', {
              defaultValue: 'Search widgets…',
            })}
            className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {visibleTools.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {t('quickAccess.emptyResults', {
              defaultValue: 'No widgets match.',
            })}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-3">
            {visibleTools.map((tool) => {
              const isSelected = selected.includes(tool.type);
              const isFull = selected.length >= MAX_SLOTS && !isSelected;
              return (
                <button
                  key={tool.type}
                  onClick={() => handleToggle(tool.type)}
                  disabled={isFull}
                  aria-label={tool.label}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl transition-all ${
                    isSelected
                      ? 'bg-brand-blue-primary text-white shadow-md ring-2 ring-brand-blue-primary/20'
                      : isFull
                        ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                        : 'bg-white text-slate-500 border border-slate-200 hover:border-brand-blue-primary hover:text-brand-blue-primary'
                  }`}
                >
                  <tool.icon className="w-7 h-7" />
                  <span className="text-xxs font-bold text-center uppercase tracking-wider leading-tight">
                    {tool.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
