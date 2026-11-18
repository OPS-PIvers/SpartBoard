// The app's shared ways to add a file: choose from the computer, choose from Drive, paste a link, paste or drop an image.
import React, { useRef, useState } from 'react';
import { CloudDownload, Link2, Loader2, Monitor } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

export const fileAddButtonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:opacity-40';

const fileAddInputClass =
  'w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm';

/** Hidden file input plus "Choose file" and "Choose from Drive" buttons. */
export const FileSourceButtons: React.FC<{
  onFiles: (files: File[]) => void;
  onDrive: () => void;
  busy: boolean;
  accept: string;
  multiple?: boolean;
  compact?: boolean;
  anchors?: { file?: TourAnchorAttrs; drive?: TourAnchorAttrs };
  inputTestId?: string;
}> = ({
  onFiles,
  onDrive,
  busy,
  accept,
  multiple = true,
  compact = false,
  anchors,
  inputTestId,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      {/* no-tour-anchor: hidden file input; the add-file button opens it */}
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        data-testid={inputTestId}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
      <button
        {...anchors?.file}
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={fileAddButtonClass}
      >
        <Monitor className="h-3.5 w-3.5" aria-hidden />
        Choose file
      </button>
      <button
        {...anchors?.drive}
        type="button"
        onClick={onDrive}
        disabled={busy}
        className={fileAddButtonClass}
      >
        <CloudDownload className="h-3.5 w-3.5" aria-hidden />
        {compact ? 'Drive' : 'Choose from Drive'}
      </button>
    </>
  );
};

/** "Paste a link" field with its Add button. */
export const UrlAddRow: React.FC<{
  onAdd: (url: string) => Promise<unknown>;
  busy: boolean;
  anchors?: { input?: TourAnchorAttrs; add?: TourAnchorAttrs };
  autoFocus?: boolean;
}> = ({ onAdd, busy, anchors, autoFocus = false }) => {
  const [url, setUrl] = useState('');
  const submit = async () => {
    if (!url.trim()) return;
    await onAdd(url);
    setUrl('');
  };
  return (
    <div className="flex gap-2">
      <input
        {...anchors?.input}
        type="url"
        autoFocus={autoFocus}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Paste a link"
        className={fileAddInputClass}
        disabled={busy}
      />
      <button
        {...anchors?.add}
        type="button"
        onClick={() => void submit()}
        disabled={busy || !url.trim()}
        className="shrink-0 flex items-center gap-1 px-3 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Link2 className="w-3.5 h-3.5" />
        )}
        Add
      </button>
    </div>
  );
};
