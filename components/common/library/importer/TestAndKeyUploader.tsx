/**
 * Two equal drop zones, Test questions and Answer key, shared by every screen
 * that reads a teacher's test (docs/plans/QUIZ_IMPORT_RELIABILITY.md R14–R17,
 * R30–R32). A zone holds one document or several photos of its pages.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CloudDownload, FileText, FileUp, Loader2, X } from 'lucide-react';
import { useFilesDrop } from '@/hooks/useFileDrop';
import { documentKind } from '@/utils/quizDocumentImport/fileKind';
import { MAX_DOCUMENT_PAGES } from '@/utils/quizDocumentImport/limits';
import {
  decodeIfHeic,
  looksLikeAnswerKey,
  naturalCompare,
  type UploadedDocument,
} from '@/utils/quizDocumentImport/uploadIntake';

export type { UploadedDocument };

export interface TestAndKeySelection {
  test: UploadedDocument | null;
  key: UploadedDocument | null;
}

type Zone = 'test' | 'key';

interface Photo {
  id: string;
  file: File;
  url: string;
}

type ZoneContent =
  | { kind: 'document'; file: Blob; fileName: string }
  | { kind: 'photos'; photos: Photo[] };

interface TestAndKeyUploaderProps {
  /** `key` shows only the answer key zone, for filling a saved quiz (R31). */
  zones?: 'both' | 'test' | 'key';
  /** The key may be read without a test, to fill answers on existing rows (R17). */
  allowKeyAlone?: boolean;
  /** An LMS export is a test, never a key, and only the wizard reads one. */
  allowCartridge?: boolean;
  pickFromDrive?: () => Promise<{ file: Blob; fileName: string } | null>;
  submitLabel: string;
  /** The button's label when only a key has been added, with `allowKeyAlone`. */
  keyAloneLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  onSubmit: (selection: TestAndKeySelection) => void;
  /** Sits between the zones and the button, e.g. the AI reader switch. */
  children?: React.ReactNode;
  /** Test seams. */
  looksLikeKey?: (file: Blob, name: string) => Promise<boolean>;
  decode?: (file: File) => Promise<File>;
}

const DOCUMENT_ACCEPT = '.pdf,.docx,.rtf';
const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.heic,.heif';

const objectUrl = (file: Blob): string =>
  typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';

const revoke = (photos: readonly Photo[]): void => {
  if (typeof URL.revokeObjectURL !== 'function') return;
  for (const p of photos) if (p.url) URL.revokeObjectURL(p.url);
};

const toUploaded = (content: ZoneContent | null): UploadedDocument | null => {
  if (!content) return null;
  if (content.kind === 'document') {
    return { file: content.file, fileName: content.fileName };
  }
  const pages = content.photos.map((p) => p.file);
  return { file: pages[0], fileName: content.photos[0].file.name, pages };
};

export const TestAndKeyUploader: React.FC<TestAndKeyUploaderProps> = ({
  zones = 'both',
  allowKeyAlone = false,
  allowCartridge = false,
  pickFromDrive,
  submitLabel,
  keyAloneLabel,
  busy = false,
  busyLabel,
  onSubmit,
  children,
  looksLikeKey = looksLikeAnswerKey,
  decode = decodeIfHeic,
}) => {
  const [content, setContent] = useState<Record<Zone, ZoneContent | null>>({
    test: null,
    key: null,
  });
  const [errors, setErrors] = useState<Record<Zone, string>>({
    test: '',
    key: '',
  });
  const [keyHint, setKeyHint] = useState(false);
  const [working, setWorking] = useState<Record<Zone, boolean>>({
    test: false,
    key: false,
  });
  // Per zone, and a ref so two quick drops can't both pass before a render.
  const inFlight = useRef<Record<Zone, boolean>>({ test: false, key: false });
  const begin = (zone: Zone): boolean => {
    if (busy || inFlight.current[zone]) return false;
    inFlight.current[zone] = true;
    setWorking((prev) => ({ ...prev, [zone]: true }));
    return true;
  };
  const end = (zone: Zone): void => {
    inFlight.current[zone] = false;
    setWorking((prev) => ({ ...prev, [zone]: false }));
  };
  const showTest = zones !== 'key';
  const showKey = zones !== 'test';

  // Thumbnails hold object URLs, which outlive the component unless released.
  const contentRef = useRef(content);
  contentRef.current = content;
  useEffect(
    () => () => {
      for (const c of Object.values(contentRef.current)) {
        if (c?.kind === 'photos') revoke(c.photos);
      }
    },
    []
  );

  const disabled = busy || working.test || working.key;

  const put = (zone: Zone, next: ZoneContent | null): void => {
    setContent((prev) => {
      const old = prev[zone];
      if (old?.kind === 'photos' && old !== next) {
        const kept = new Set(
          next?.kind === 'photos' ? next.photos.map((p) => p.id) : []
        );
        revoke(old.photos.filter((p) => !kept.has(p.id)));
      }
      return { ...prev, [zone]: next };
    });
    setKeyHint(false);
  };

  const fail = (zone: Zone, message: string): void =>
    setErrors((prev) => ({ ...prev, [zone]: message }));

  const unreadable = (zone: Zone): string =>
    zone === 'key'
      ? 'That answer key can’t be read. Use a PDF, a Word file (.docx), a rich text file (.rtf), a Google Doc or photos of the pages.'
      : `That file can’t be read. Use a PDF, a Word file (.docx), a rich text file (.rtf), a Google Doc${allowCartridge ? ', an LMS export (.imscc)' : ''} or photos of the pages.`;

  /** Whether a zone takes this document at all. */
  const acceptsDocument = (zone: Zone, file: Blob, name: string): boolean => {
    const kind = documentKind(file, name);
    if (!kind || kind === 'image') return false;
    if (kind === 'cartridge') return zone === 'test' && allowCartridge;
    return true;
  };

  const placeDocument = async (
    zone: Zone,
    file: Blob,
    fileName: string
  ): Promise<void> => {
    if (!acceptsDocument(zone, file, fileName)) {
      fail(zone, unreadable(zone));
      return;
    }
    put(zone, { kind: 'document', file, fileName });
    // R32: a key dropped on the test zone is pointed out, never moved.
    if (zone === 'test' && showKey && !content.key) {
      const isKey = await looksLikeKey(file, fileName);
      // The key zone may have been filled while the file was read.
      const now = contentRef.current;
      if (
        isKey &&
        !now.key &&
        now.test?.kind === 'document' &&
        now.test.file === file
      ) {
        setKeyHint(true);
      }
    }
  };

  const addPhotos = async (zone: Zone, files: File[]): Promise<void> => {
    const decoded: File[] = [];
    for (const f of files) decoded.push(await decode(f));
    const existing =
      contentRef.current[zone]?.kind === 'photos'
        ? (contentRef.current[zone] as { photos: Photo[] }).photos
        : [];
    const added = decoded
      .sort((a, b) => naturalCompare(a.name, b.name))
      .map((file) => ({ id: crypto.randomUUID(), file, url: objectUrl(file) }));
    const photos = [...existing, ...added];
    if (photos.length > MAX_DOCUMENT_PAGES) {
      revoke(added);
      fail(
        zone,
        `That’s ${photos.length} photos. Use ${MAX_DOCUMENT_PAGES} or fewer, one per page.`
      );
      return;
    }
    put(zone, { kind: 'photos', photos });
  };

  /** R16: two documents dropped together are sorted into test and key. */
  const autoAssign = async (zone: Zone, files: File[]): Promise<void> => {
    const [a, b] = files;
    const [aKey, bKey] = await Promise.all([
      looksLikeKey(a, a.name),
      looksLikeKey(b, b.name),
    ]);
    let test = zone === 'test' ? a : b;
    let key = zone === 'test' ? b : a;
    if (aKey !== bKey) {
      test = aKey ? b : a;
      key = aKey ? a : b;
    }
    if (!acceptsDocument('test', test, test.name)) {
      fail('test', unreadable('test'));
      return;
    }
    if (!acceptsDocument('key', key, key.name)) {
      fail('key', unreadable('key'));
      return;
    }
    put('test', { kind: 'document', file: test, fileName: test.name });
    put('key', { kind: 'document', file: key, fileName: key.name });
  };

  const takeFiles = async (zone: Zone, files: File[]): Promise<void> => {
    if (files.length === 0 || !begin(zone)) return;
    setErrors((prev) => ({ ...prev, [zone]: '' }));
    try {
      const images = files.filter((f) => documentKind(f, f.name) === 'image');
      if (images.length === files.length) {
        await addPhotos(zone, images);
      } else if (images.length > 0) {
        fail(zone, 'Drop one document, or photos of its pages, not both.');
      } else if (files.length === 1) {
        await placeDocument(zone, files[0], files[0].name);
      } else if (files.length === 2 && showTest && showKey) {
        await autoAssign(zone, files);
      } else {
        fail(
          zone,
          showTest && showKey
            ? 'Drop the test and its answer key, or one document at a time.'
            : 'Drop one document at a time.'
        );
      }
    } catch (err) {
      fail(
        zone,
        err instanceof Error ? err.message : 'That file couldn’t be opened.'
      );
    } finally {
      end(zone);
    }
  };

  const pickDrive = async (zone: Zone): Promise<void> => {
    if (!pickFromDrive || !begin(zone)) return;
    setErrors((prev) => ({ ...prev, [zone]: '' }));
    try {
      const picked = await pickFromDrive();
      if (picked) await placeDocument(zone, picked.file, picked.fileName);
    } catch (err) {
      fail(
        zone,
        err instanceof Error ? err.message : 'Could not open the Drive file.'
      );
    } finally {
      end(zone);
    }
  };

  const swap = (): void => {
    setContent((prev) => ({ test: prev.key, key: prev.test }));
    setKeyHint(false);
  };

  const moveTestToKey = (): void => {
    setContent((prev) => (prev.key ? prev : { test: null, key: prev.test }));
    setKeyHint(false);
  };

  const movePhoto = (zone: Zone, from: number, to: number): void => {
    const current = content[zone];
    if (current?.kind !== 'photos') return;
    if (to < 0 || to >= current.photos.length || from === to) return;
    const photos = [...current.photos];
    const [moved] = photos.splice(from, 1);
    photos.splice(to, 0, moved);
    put(zone, { kind: 'photos', photos });
  };

  const removePhoto = (zone: Zone, index: number): void => {
    const current = content[zone];
    if (current?.kind !== 'photos') return;
    const photos = current.photos.filter((_, i) => i !== index);
    put(zone, photos.length > 0 ? { kind: 'photos', photos } : null);
  };

  const canSubmit =
    !disabled &&
    (showTest
      ? content.test !== null || (allowKeyAlone && content.key !== null)
      : content.key !== null);

  const submit = (): void => {
    if (!canSubmit) return;
    onSubmit({
      test: showTest ? toUploaded(content.test) : null,
      key: showKey ? toUploaded(content.key) : null,
    });
  };

  return (
    <div className="space-y-3">
      <div
        className={`grid gap-3 ${showTest && showKey ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
      >
        {showTest && (
          <DropZone
            zone="test"
            title="Test questions"
            hint={`PDF, Word, .rtf${allowCartridge ? ', LMS export' : ''} or photos`}
            accept={`${DOCUMENT_ACCEPT}${allowCartridge ? ',.imscc' : ''},${PHOTO_ACCEPT}`}
            content={content.test}
            error={errors.test}
            working={working.test}
            disabled={busy || working.test}
            canPickFromDrive={!!pickFromDrive}
            onFiles={(files) => void takeFiles('test', files)}
            onPickDrive={() => void pickDrive('test')}
            onRemove={() => put('test', null)}
            onMovePhoto={(from, to) => movePhoto('test', from, to)}
            onRemovePhoto={(i) => removePhoto('test', i)}
          >
            {keyHint && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                <span>
                  This looks like an answer key. Move it to Answer key?
                </span>
                <button
                  type="button"
                  onClick={moveTestToKey}
                  className="font-bold text-brand-blue-primary hover:underline"
                >
                  Move it
                </button>
              </div>
            )}
          </DropZone>
        )}
        {showKey && (
          <DropZone
            zone="key"
            title={showTest ? 'Answer key (optional)' : 'Answer key'}
            hint="PDF, Word, .rtf or photos"
            accept={`${DOCUMENT_ACCEPT},${PHOTO_ACCEPT}`}
            content={content.key}
            error={errors.key}
            working={working.key}
            disabled={busy || working.key}
            canPickFromDrive={!!pickFromDrive}
            onFiles={(files) => void takeFiles('key', files)}
            onPickDrive={() => void pickDrive('key')}
            onRemove={() => put('key', null)}
            onMovePhoto={(from, to) => movePhoto('key', from, to)}
            onRemovePhoto={(i) => removePhoto('key', i)}
          />
        )}
      </div>

      {showTest && showKey && content.test && content.key && (
        <button
          type="button"
          onClick={swap}
          disabled={disabled}
          className="text-xs font-bold text-slate-600 hover:text-brand-blue-primary disabled:opacity-40"
        >
          Swap test and answer key
        </button>
      )}

      {children}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-blue-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy && busyLabel
          ? busyLabel
          : keyAloneLabel && showTest && !content.test && content.key
            ? keyAloneLabel
            : submitLabel}
      </button>
    </div>
  );
};

interface DropZoneProps {
  zone: Zone;
  title: string;
  hint: string;
  accept: string;
  content: ZoneContent | null;
  error: string;
  working: boolean;
  disabled: boolean;
  canPickFromDrive: boolean;
  onFiles: (files: File[]) => void;
  onPickDrive: () => void;
  onRemove: () => void;
  onMovePhoto: (from: number, to: number) => void;
  onRemovePhoto: (index: number) => void;
  children?: React.ReactNode;
}

const DropZone: React.FC<DropZoneProps> = ({
  zone,
  title,
  hint,
  accept,
  content,
  error,
  working,
  disabled,
  canPickFromDrive,
  onFiles,
  onPickDrive,
  onRemove,
  onMovePhoto,
  onRemovePhoto,
  children,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const drop = useFilesDrop(onFiles, disabled);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const titleId = `test-key-uploader-${zone}`;
  const photos = content?.kind === 'photos' ? content.photos : [];

  return (
    <section
      aria-labelledby={titleId}
      data-testid={`${zone}-zone`}
      {...drop.dropProps}
      className={`flex min-h-[9rem] flex-col gap-2 rounded-2xl border-2 border-dashed p-3 transition-colors ${
        drop.dragging
          ? 'border-brand-blue-primary bg-brand-blue-lighter/50'
          : 'border-slate-300 bg-slate-50/60'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={titleId} className="text-sm font-bold text-slate-800">
          {title}
        </h3>
        {content && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${title.replace(' (optional)', '').toLowerCase()}`}
            className="text-xs font-bold text-slate-500 hover:text-brand-red-primary disabled:opacity-40"
          >
            Remove
          </button>
        )}
      </div>

      {content?.kind === 'document' && (
        <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-700">
          <FileText className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate">{content.fileName}</span>
        </p>
      )}

      {photos.length > 0 && (
        <>
          <ol aria-label={`${title} pages`} className="grid grid-cols-4 gap-2">
            {photos.map((photo, i) => (
              <li
                key={photo.id}
                draggable={!disabled}
                tabIndex={0}
                aria-label={`Page ${i + 1}: ${photo.file.name}. Use the arrow keys to reorder.`}
                onDragStart={() => setDragFrom(i)}
                onDragEnd={() => setDragFrom(null)}
                onDragOver={(e) => {
                  if (dragFrom !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onMovePhoto(dragFrom, i);
                  setDragFrom(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    onMovePhoto(i, i - 1);
                  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    onMovePhoto(i, i + 1);
                  }
                }}
                className="group relative aspect-[3/4] cursor-grab overflow-hidden rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
              >
                {photo.url && (
                  <img
                    src={photo.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute bottom-0 left-0 rounded-tr-md bg-slate-900/75 px-1.5 text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePhoto(i)}
                  disabled={disabled}
                  aria-label={`Remove page ${i + 1}`}
                  className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5 text-slate-600 hover:text-brand-red-primary"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ol>
          {photos.length > 1 && (
            <p className="text-[11px] text-slate-500">
              Drag the pages into order.
            </p>
          )}
        </>
      )}

      {children}

      {(!content || content.kind === 'photos') && (
        <div className="mt-auto flex flex-col items-center gap-1.5 text-center">
          {!content && (
            <>
              {working ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <FileUp className="h-5 w-5 text-slate-500" />
              )}
              <p className="text-xs text-slate-600">
                {drop.dragging ? 'Drop it here' : `Drop a file here · ${hint}`}
              </p>
            </>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:opacity-40"
            >
              {content?.kind === 'photos' ? 'Add photos' : 'Choose file'}
            </button>
            {canPickFromDrive && !content && (
              <button
                type="button"
                onClick={onPickDrive}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:opacity-40"
              >
                <CloudDownload className="h-3.5 w-3.5" />
                Choose from Drive
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="text-xs font-semibold text-brand-red-primary"
        >
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        aria-label={`Upload ${title.replace(' (optional)', '').toLowerCase()}`}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          onFiles(files);
        }}
      />
    </section>
  );
};
