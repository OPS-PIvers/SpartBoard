// Every way to add one image: upload, paste, drop, Google Drive or an image link.
import React, { useCallback, useRef, useState } from 'react';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { isImageFile, usePasteFiles } from '../fileAdd/usePasteFiles';

export interface ImageSourcesOptions {
  /** Saves the file wherever the caller keeps its images; resolves to the URL, or null when it can't be used. */
  upload: (file: File) => Promise<string | null>;
  onChange: (url: string) => void;
  /** Image links are kept as links unless the caller needs the file itself. */
  linkAsFile?: boolean;
  accept?: string;
  maxBytes?: number;
  disabled?: boolean;
  /** Takes several files at once from upload, drop or paste; each one saves and calls onChange. */
  multiple?: boolean;
  /** With multiple, gets each batch's counts and replaces the picker's own error line. */
  onBatchDone?: (result: BatchResult) => void;
  /** Paste reaches the picker anywhere in its dialog, or only inside the picker. */
  pasteScope?: 'dialog' | 'element' | 'off';
  /** The element paste is scoped to. */
  scopeRef: React.RefObject<HTMLElement | null>;
}

const DEFAULT_MAX = 10 * 1024 * 1024;

/** A message the picker shows as written; anything else shows the generic line. */
class PickerError extends Error {}
class TooLargeError extends PickerError {}

export interface BatchResult {
  added: number;
  failed: number;
  tooLarge: number;
}

export type RunResult = 'added' | 'skipped' | 'failed';

// Files the app itself saved; a link to one is re-picked from Drive so a later delete can't trash the original.
const APP_FILE_HOSTS = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'docs.google.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
];

export const isImageLink = (raw: string): boolean => {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};

export function useImageSources({
  upload,
  onChange,
  linkAsFile = false,
  accept = 'image/*',
  maxBytes = DEFAULT_MAX,
  disabled = false,
  multiple = false,
  onBatchDone,
  pasteScope = 'dialog',
  scopeRef,
}: ImageSourcesOptions) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const { openPicker } = useGooglePicker();
  const { getDriveFileAsBlob } = useGoogleDrive();

  const run = useCallback(
    async (work: () => Promise<string | null>): Promise<RunResult> => {
      if (inFlight.current || disabled) return 'skipped';
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const url = await work();
        if (!url) return 'skipped';
        onChange(url);
        return 'added';
      } catch (err) {
        setError(
          err instanceof PickerError ? err.message : "The image didn't add."
        );
        return 'failed';
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [disabled, onChange]
  );

  // Every source goes through the same type and size check before it saves.
  const save = useCallback(
    (file: File) => {
      if (!isImageFile(file)) throw new PickerError('Select an image file.');
      if (file.size > maxBytes) {
        throw new TooLargeError(
          `That image is too large. The limit is ${Math.round(maxBytes / 1048576)} MB.`
        );
      }
      return upload(file);
    },
    [upload, maxBytes]
  );

  const addFile = useCallback(
    (file: File) => run(async () => save(file)),
    [run, save]
  );

  // Saves each file in turn; the first problem stays on screen after the rest finish.
  const addFiles = useCallback(
    async (files: File[]) => {
      if (!multiple || (files.length < 2 && !onBatchDone)) {
        if (files[0]) await addFile(files[0]);
        return;
      }
      if (files.length === 0 || inFlight.current || disabled) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      let firstError: string | null = null;
      const result: BatchResult = { added: 0, failed: 0, tooLarge: 0 };
      try {
        for (const file of files) {
          try {
            const url = await save(file);
            if (url) {
              onChange(url);
              result.added++;
            }
          } catch (err) {
            if (err instanceof TooLargeError) result.tooLarge++;
            else result.failed++;
            firstError ??=
              err instanceof PickerError
                ? err.message
                : "The image didn't add.";
          }
        }
      } finally {
        if (onBatchDone) onBatchDone(result);
        else setError(firstError);
        inFlight.current = false;
        setBusy(false);
      }
    },
    [multiple, onBatchDone, addFile, disabled, save, onChange]
  );

  const openFile = useCallback(() => inputRef.current?.click(), []);

  const openDrive = useCallback(
    () =>
      run(async () => {
        const picked = await openPicker({ mode: 'images' }).catch(
          (err: unknown) => {
            throw new PickerError(
              err instanceof Error ? err.message : "Google Drive didn't open."
            );
          }
        );
        if (!picked) return null;
        const got = await getDriveFileAsBlob(picked.id);
        if (!got) throw new PickerError("That Drive image didn't open.");
        return save(new File([got.blob], got.name, { type: got.mimeType }));
      }),
    [run, openPicker, getDriveFileAsBlob, save]
  );

  const addLink = useCallback(
    (raw: string) =>
      run(async () => {
        const link = raw.trim();
        if (!isImageLink(link)) {
          throw new PickerError('Paste a link that starts with https.');
        }
        if (APP_FILE_HOSTS.includes(new URL(link).hostname)) {
          throw new PickerError(
            'Select that image with the Google Drive button.'
          );
        }
        if (!linkAsFile) return link;
        const res = await fetch(link).catch(() => null);
        const blob = res?.ok ? await res.blob() : null;
        if (!blob || !blob.type.startsWith('image/')) {
          throw new PickerError(
            "That link can't be used here. Download the image and upload it."
          );
        }
        return save(new File([blob], 'linked-image', { type: blob.type }));
      }),
    [run, linkAsFile, save]
  );

  const onPasted = useCallback(
    (files: File[]) => void addFiles(files),
    [addFiles]
  );
  usePasteFiles(
    onPasted,
    disabled || pasteScope === 'off',
    scopeRef,
    isImageFile,
    pasteScope === 'element' ? 'element' : 'dialog'
  );

  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes('Files');

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e) || disabled) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      void addFiles(Array.from(e.dataTransfer.files).filter(isImageFile));
    },
  };

  const fileInput = (
    // no-tour-anchor: hidden file input; the Upload button opens it
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      className="hidden"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        void addFiles(files);
      }}
    />
  );

  return {
    busy,
    disabled,
    error,
    setError,
    dragging,
    dropProps,
    fileInput,
    openFile,
    openDrive,
    addLink,
  };
}

export type ImageSources = ReturnType<typeof useImageSources>;
