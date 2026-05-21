/**
 * PlcDocPicker — add / rename / remove doc links in the PLC Docs surface.
 *
 * Responsibilities:
 *   - Renders a list of existing PlcDocs with a rename-in-place affordance and
 *     a remove button on each row.
 *   - Provides an inline "Add doc" form (title + URL).
 *
 * All mutations delegate to the callbacks passed from PlcDocsBody which come
 * from usePlcDocs. The picker itself is stateless with respect to the doc list.
 */

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react';
import type { PlcDoc } from '@/types';

/** Imperative handle exposed to parents so the Docs empty-state CTA can
 *  focus this picker's add-title input without a brittle DOM query. */
export interface PlcDocPickerHandle {
  focusAddInput: () => void;
}

interface PlcDocPickerProps {
  docs: PlcDoc[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateDoc: (input: { title: string; url: string }) => Promise<string>;
  onUpdateDoc: (
    id: string,
    patch: { title?: string; url?: string }
  ) => Promise<void>;
  onDeleteDoc: (id: string) => Promise<void>;
  /** Surface add-form failures to the parent (e.g. for a toast). */
  onAddError?: (err: unknown) => void;
  /** Surface rename failures to the parent (e.g. for a toast). */
  onUpdateError?: (err: unknown) => void;
}

export const PlcDocPicker = forwardRef<PlcDocPickerHandle, PlcDocPickerProps>(
  function PlcDocPicker(
    {
      docs,
      selectedId,
      onSelect,
      onCreateDoc,
      onUpdateDoc,
      onDeleteDoc,
      onAddError,
      onUpdateError,
    },
    ref
  ) {
    const { t } = useTranslation();

    // Add form state
    const [addTitle, setAddTitle] = useState('');
    const [addUrl, setAddUrl] = useState('');
    const [adding, setAdding] = useState(false);

    // Ref to the add-title input — focused via the imperative handle when the
    // empty-state CTA in PlcDocsBody is clicked (scoped to THIS picker's
    // input, not a document-wide querySelector).
    const addTitleRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({
      focusAddInput: () => addTitleRef.current?.focus(),
    }));

    // Rename state — one row at a time
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const handleAdd = async () => {
      const title = addTitle.trim();
      const url = addUrl.trim();
      if (!title || !url) return;
      setAdding(true);
      try {
        const newId = await onCreateDoc({ title, url });
        setAddTitle('');
        setAddUrl('');
        // Select the newly created doc
        onSelect(newId);
      } catch (err) {
        // Surface the failure to the parent so it can toast — previously the
        // rejected promise was swallowed and the user got no feedback.
        onAddError?.(err);
      } finally {
        setAdding(false);
      }
    };

    const handleStartRename = (doc: PlcDoc) => {
      setRenamingId(doc.id);
      setRenameValue(doc.title);
    };

    const handleConfirmRename = async (id: string) => {
      const title = renameValue.trim();
      if (!title) {
        // Empty rename is a no-op confirm — just close the editor.
        setRenamingId(null);
        return;
      }
      try {
        await onUpdateDoc(id, { title });
        setRenamingId(null);
      } catch (err) {
        // Surface the failure to the parent so it can toast, and leave the row
        // open in edit mode so the user can retry — previously the rejected
        // promise was discarded (void at the call sites) with no feedback.
        onUpdateError?.(err);
      }
    };

    const handleCancelRename = () => {
      setRenamingId(null);
      setRenameValue('');
    };

    const handleDelete = async (id: string) => {
      await onDeleteDoc(id);
      // If we deleted the selected doc, selection will be managed by parent
    };

    return (
      <div className="flex flex-col h-full">
        {/* Doc list */}
        <div className="flex-1 overflow-y-auto">
          {docs.map((doc) => {
            const isSelected = doc.id === selectedId;
            const isRenaming = renamingId === doc.id;

            return (
              <div
                key={doc.id}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-brand-blue-primary/10 text-brand-blue-primary'
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
                onClick={() => !isRenaming && onSelect(doc.id)}
              >
                {isRenaming ? (
                  <>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleConfirmRename(doc.id);
                        if (e.key === 'Escape') handleCancelRename();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-white border border-brand-blue-primary/50 rounded px-2 py-0.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-blue-primary/50"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleConfirmRename(doc.id);
                      }}
                      className="shrink-0 p-1 rounded text-green-600 hover:bg-green-50 transition-colors"
                      aria-label={t('plcDashboard.docs.confirmRename', {
                        defaultValue: 'Confirm rename',
                      })}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelRename();
                      }}
                      className="shrink-0 p-1 rounded text-slate-400 hover:bg-slate-100 transition-colors"
                      aria-label={t('plcDashboard.docs.cancelRename', {
                        defaultValue: 'Cancel rename',
                      })}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">
                      {doc.title}
                    </span>
                    {/* Action buttons — visible on hover or when selected */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(doc);
                      }}
                      className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label={t('plcDashboard.docs.rename', {
                        defaultValue: 'Rename doc',
                      })}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(doc.id);
                      }}
                      className="shrink-0 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label={t('plcDashboard.docs.remove', {
                        defaultValue: 'Remove doc',
                      })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Add doc form */}
        <div className="shrink-0 border-t border-slate-200 pt-3 mt-2 flex flex-col gap-2">
          <input
            ref={addTitleRef}
            type="text"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            placeholder={t('plcDashboard.docs.titlePlaceholder', {
              defaultValue: 'Doc title',
            })}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-blue-primary/50 focus:border-brand-blue-primary/50"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd();
            }}
            disabled={adding}
          />
          <input
            type="url"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            placeholder={t('plcDashboard.docs.urlPlaceholder', {
              defaultValue: 'Paste Google Doc URL',
            })}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-blue-primary/50 focus:border-brand-blue-primary/50"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd();
            }}
            disabled={adding}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !addTitle.trim() || !addUrl.trim()}
            className="flex items-center justify-center gap-1.5 bg-brand-blue-primary text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-brand-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={t('plcDashboard.docs.addDoc', {
              defaultValue: 'Add',
            })}
          >
            <Plus className="w-4 h-4" />
            {t('plcDashboard.docs.addDoc', { defaultValue: 'Add' })}
          </button>
        </div>
      </div>
    );
  }
);
