/**
 * PlcSharePickerModal — generic personal-library picker shown from the
 * PLC Quiz Library / Video Activities tabs. Lets a teacher pick one of
 * their personal items (quizzes / video activities) and share it with
 * the current PLC, without leaving the dashboard to dig into the
 * widget kebab.
 *
 * The actual share write is the caller's responsibility — this modal
 * just resolves the user's pick. The caller's `onPick(itemId)` callback
 * runs the share flow, surfaces success/error toasts, and closes the
 * modal.
 *
 * Empty state: if the teacher has no shareable personal items, the
 * modal explains why and offers a "Close" out. This is more discoverable
 * than a disabled CTA button.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, Share2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export interface PlcSharePickerItem {
  id: string;
  title: string;
  /** Secondary metadata line (e.g. "12 questions · Jan 14, 2026"). */
  metaLine?: string;
  /**
   * When true the item is already shared with the current PLC; we still
   * render it but disable the Share button and surface a small pill so
   * the teacher knows why.
   */
  alreadyShared?: boolean;
}

interface PlcSharePickerModalProps {
  /** Header title (e.g. "Share a quiz with this PLC"). */
  title: string;
  /** Sub-header line, usually the PLC name. */
  subtitle: string;
  /** Prompt above the item list. */
  prompt: string;
  /** Localized message when `items` is empty. */
  emptyMessage: string;
  /** Items in display order (caller sorts; modal doesn't re-sort). */
  items: PlcSharePickerItem[];
  /**
   * Resolved when the user picks an item. The caller drives the share
   * write + toast. The modal closes after onPick resolves (or rejects).
   */
  onPick: (itemId: string) => Promise<void>;
  onClose: () => void;
}

export const PlcSharePickerModal: React.FC<PlcSharePickerModalProps> = ({
  title,
  subtitle,
  prompt,
  emptyMessage,
  items,
  onPick,
  onClose,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [items, query]);

  const handlePick = async (itemId: string) => {
    if (busyId) return;
    setBusyId(itemId);
    try {
      await onPick(itemId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      isOpen
      onClose={busyId ? () => undefined : onClose}
      ariaLabel={title}
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busyId}
            aria-label={t('plcDashboard.sharePicker.close', {
              defaultValue: 'Close',
            })}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-3">
        <p className="text-xs text-slate-600">{prompt}</p>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center">
            <p className="text-sm text-slate-600">{emptyMessage}</p>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('plcDashboard.sharePicker.searchPlaceholder', {
                  defaultValue: 'Search…',
                })}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary"
              />
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar -mx-1 px-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-3">
                  {t('plcDashboard.sharePicker.noMatches', {
                    defaultValue: 'No matches.',
                  })}
                </p>
              ) : (
                filtered.map((item) => {
                  const rowBusy = busyId === item.id;
                  const disabled = !!item.alreadyShared || !!busyId;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-800 truncate">
                            {item.title}
                          </span>
                          {item.alreadyShared && (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                              {t('plcDashboard.sharePicker.alreadyShared', {
                                defaultValue: 'Already shared',
                              })}
                            </span>
                          )}
                        </div>
                        {item.metaLine && (
                          <p className="text-xxs text-slate-500 mt-0.5 truncate">
                            {item.metaLine}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handlePick(item.id)}
                        disabled={disabled}
                        className="shrink-0 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors bg-brand-blue-primary text-white hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {rowBusy ? (
                          <Loader2
                            className="w-3.5 h-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {t('plcDashboard.sharePicker.shareAction', {
                          defaultValue: 'Share',
                        })}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
