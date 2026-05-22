import React, { useRef, useState } from 'react';
import { parseNotebookFile } from '@/utils/notebookParser';
import { EditableObjectInfo } from '@/utils/notebookSvgEdit';
import { PageEditor } from '@/components/widgets/SmartNotebook/components/PageEditor';

/**
 * DEV-ONLY harness for iterating on the SVG page editor against real notebook
 * pages without the full Firestore/upload flow. Registered only when
 * import.meta.env.DEV is true, so it is tree-shaken out of production builds.
 */
export const NotebookEditorDevHarness: React.FC = () => {
  const [pages, setPages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState<EditableObjectInfo[]>([]);
  const [editedLen, setEditedLen] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setLoading(true);
    setSelection([]);
    try {
      const parsed = await parseNotebookFile(file);
      const texts = await Promise.all(parsed.pages.map((p) => p.blob.text()));
      setPages(texts);
      setIndex(0);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to parse notebook');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-200 p-4 font-sans flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          className="bg-indigo-600 text-white font-bold rounded-lg px-4 py-2"
        >
          {loading ? 'Loading…' : 'Load .notebook / .spartnb'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".notebook,.spartnb"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        {pages.length > 0 && (
          <>
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="bg-white border rounded-lg px-3 py-2 font-bold"
            >
              ◀
            </button>
            <span className="font-mono text-sm">
              page {index + 1} / {pages.length}
            </span>
            <button
              onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))}
              className="bg-white border rounded-lg px-3 py-2 font-bold"
            >
              ▶
            </button>
            <span className="ml-4 text-sm font-semibold text-slate-700">
              selected:{' '}
              <span className="font-mono text-indigo-700">
                {selection.length
                  ? `${selection.length} · ${selection.map((s) => s.kind).join(', ')}`
                  : 'none'}
              </span>
            </span>
            <span className="text-sm font-semibold text-slate-700">
              edited:{' '}
              <span className="font-mono text-green-700">
                {editedLen !== null ? `${editedLen} chars` : 'no'}
              </span>
            </span>
            <span className="text-xs text-slate-400">
              click to select · drag to move · drag corners to resize ·
              dbl-click text · Ctrl/⌘+D duplicate · Delete to remove
            </span>
          </>
        )}
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-inner border border-slate-300 overflow-hidden">
        {pages[index] ? (
          <PageEditor
            svg={pages[index]}
            onSelectionChange={setSelection}
            onChange={(s) => setEditedLen(s.length)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 font-semibold">
            Load a notebook to start editing.
          </div>
        )}
      </div>
    </div>
  );
};

export default NotebookEditorDevHarness;
