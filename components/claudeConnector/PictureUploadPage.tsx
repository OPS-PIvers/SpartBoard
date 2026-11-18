// `/claude-pictures#<ticket>`: a teacher drops pictures here so Claude can use them; the ticket is the only credential.
import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AlertCircle, Check, ImagePlus, Loader2 } from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import {
  MAX_PICTURE_BYTES,
  PICTURE_TYPES,
  shrinkPicture,
  uploadPicture,
} from './pictureUploadApi';

type Row = {
  id: string;
  name: string;
  preview: string;
  state: 'saving' | 'added' | 'failed';
  error?: string;
};

const readTicket = (): string => window.location.hash.replace(/^#/, '').trim();

export const PictureUploadPage: React.FC = () => {
  const [ticket] = useState(readTicket);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [expired, setExpired] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  const update = (id: string, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addFiles = (files: File[]) => {
    for (const file of files) {
      if (!PICTURE_TYPES.includes(file.type)) continue;
      const id = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      urls.current.push(preview);
      setRows((list) => [
        ...list,
        { id, name: file.name || 'Pasted picture', preview, state: 'saving' },
      ]);
      void (async () => {
        try {
          const ready =
            file.size > MAX_PICTURE_BYTES ? await shrinkPicture(file) : file;
          const result = await uploadPicture(ticket, ready);
          if (result.ok) {
            update(id, { state: 'added' });
            return;
          }
          if (result.expired) setExpired(true);
          update(id, { state: 'failed', error: result.error });
        } catch {
          update(id, {
            state: 'failed',
            error: 'It could not be sent. Check your connection.',
          });
        }
      })();
    }
  };

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  });
  useEffect(() => {
    const listener = (event: ClipboardEvent) => onPaste(event);
    window.addEventListener('paste', listener);
    return () => window.removeEventListener('paste', listener);
  }, []);

  useEffect(() => {
    const list = urls.current;
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const added = rows.filter((r) => r.state === 'added').length;
  const saving = rows.some((r) => r.state === 'saving');

  if (!ticket || expired) {
    return (
      <main className="h-screen h-dvh overflow-y-auto bg-slate-100 px-4 py-16 pb-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6">
          <AlertCircle className="h-6 w-6 text-amber-600" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold text-slate-900">
            This link has expired
          </h1>
          <p className="mt-2 text-base text-slate-600">
            Ask Claude for a new upload link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen h-dvh overflow-y-auto bg-slate-100 px-4 py-10 pb-16 sm:py-16">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {APP_NAME}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Add pictures for Claude
        </h1>
        <p className="mt-2 text-base text-slate-600">
          They save to your Google Drive.
        </p>

        {/* no-tour-anchor: a one-time page Claude links to, never part of a tour */}
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(Array.from(e.dataTransfer.files));
          }}
          className={`mt-5 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors [-webkit-tap-highlight-color:transparent] ${
            dragging
              ? 'border-brand-blue-primary bg-blue-50'
              : 'border-slate-300 bg-slate-50 hover:border-slate-400'
          }`}
        >
          <ImagePlus className="h-8 w-8 text-slate-500" aria-hidden />
          <span className="text-base font-semibold text-slate-800">
            Drop pictures here or select them
          </span>
          <span className="text-sm text-slate-500">
            You can also paste. PNG, JPEG, GIF or WebP.
          </span>
        </button>
        <input
          ref={input}
          type="file"
          accept={PICTURE_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />

        {rows.length > 0 && (
          <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2.5">
                <img
                  src={row.preview}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-slate-800">
                    {row.name}
                  </p>
                  {row.state === 'failed' && (
                    <p className="text-sm text-red-700">{row.error}</p>
                  )}
                </div>
                {row.state === 'saving' && (
                  <Loader2
                    className="h-5 w-5 shrink-0 animate-spin text-slate-500"
                    aria-label="Saving"
                  />
                )}
                {row.state === 'added' && (
                  <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-700">
                    <Check className="h-4 w-4" aria-hidden />
                    Added
                  </span>
                )}
                {row.state === 'failed' && (
                  <AlertCircle
                    className="h-5 w-5 shrink-0 text-red-600"
                    aria-label="Not added"
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {added > 0 && !saving && (
          <p
            className="mt-5 text-base font-medium text-slate-800"
            role="status"
          >
            Go back to Claude and say the pictures are added.
          </p>
        )}
      </div>
    </main>
  );
};
