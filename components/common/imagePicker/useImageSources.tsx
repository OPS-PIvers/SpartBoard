// Every way to add one image: upload, paste, drop, Google Drive or an image link.
import React, { useCallback, useRef, useState } from 'react';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { isImageFile, usePasteFiles } from '../fileAdd/usePasteFiles';

export interface ImageSourcesBase {
  /** Image links are kept as links unless the caller needs the file itself. */
  linkAsFile?: boolean;
  /** Which files it takes; images by default. */
  acceptFile?: (file: File) => boolean;
  /** Takes several files at once from upload, drop and paste. */
  multiple?: boolean;
  accept?: string;
  maxBytes?: number;
  disabled?: boolean;
  /** Paste reaches the picker anywhere in its dialog, or only inside the picker. */
  pasteScope?: 'dialog' | 'element' | 'off';
  /** The element paste is scoped to. */
  scopeRef: React.RefObject<HTMLElement | null>;
}

export type ImageDelivery =
  | {
      /** Saves the file wherever the caller keeps its images; resolves to the URL, or null when it can't be used. */
      upload: (file: File) => Promise<string | null>;
      onChange: (url: string) => void;
      takeFiles?: never;
    }
  | {
      /** Hands the files to a caller that saves them itself; resolves true when they were added. */
      takeFiles: (files: File[]) => Promise<boolean>;
      upload?: never;
      onChange?: never;
    };

export type ImageSourcesOptions = ImageSourcesBase & ImageDelivery;

const DEFAULT_MAX = 10 * 1024 * 1024;

/** A message the picker shows as written; anything else shows the generic line. */
class PickerError extends Error {}

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
  takeFiles,
  linkAsFile = false,
  acceptFile = isImageFile,
  multiple = false,
  accept = 'image/*',
  maxBytes = DEFAULT_MAX,
  disabled = false,
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
    async (work: () => Promise<boolean>): Promise<RunResult> => {
      if (inFlight.current || disabled) return 'skipped';
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        return (await work()) ? 'added' : 'skipped';
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
    [disabled]
  );

  // Every source goes through the same type and size check before it saves.
  const save = useCallback(
    async (picked: File[]): Promise<boolean> => {
      // A caller taking several files skips the ones it can't use and checks sizes itself.
      const batch = takeFiles && multiple;
      const files = batch ? picked.filter(acceptFile) : picked;
      if (files.length === 0) throw new PickerError('Select an image file.');
      for (const file of batch ? [] : files) {
        if (!acceptFile(file)) throw new PickerError('Select an image file.');
        if (file.size > maxBytes) {
          throw new PickerError(
            `That image is too large. The limit is ${Math.round(maxBytes / 1048576)} MB.`
          );
        }
      }
      if (takeFiles) return takeFiles(files);
      if (!upload || !onChange) return false;
      const url = await upload(files[0]);
      if (!url) return false;
      onChange(url);
      return true;
    },
    [acceptFile, maxBytes, takeFiles, multiple, upload, onChange]
  );

  const addFiles = useCallback(
    (files: File[]) =>
      run(async () => save(multiple ? files : files.slice(0, 1))),
    [run, save, multiple]
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
        if (!picked) return false;
        const got = await getDriveFileAsBlob(picked.id);
        if (!got) throw new PickerError("That Drive image didn't open.");
        return save([new File([got.blob], got.name, { type: got.mimeType })]);
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
        if (!linkAsFile && onChange) {
          onChange(link);
          return true;
        }
        const res = await fetch(link).catch(() => null);
        const blob = res?.ok ? await res.blob() : null;
        const file =
          blob && new File([blob], 'linked-image', { type: blob.type });
        if (!file || !acceptFile(file)) {
          throw new PickerError(
            "That link can't be used here. Download the image and upload it."
          );
        }
        return save([file]);
      }),
    [run, linkAsFile, onChange, acceptFile, save]
  );

  const onPasted = useCallback(
    (files: File[]) => {
      if (files.length > 0) void addFiles(files);
    },
    [addFiles]
  );
  usePasteFiles(
    onPasted,
    disabled || pasteScope === 'off',
    scopeRef,
    acceptFile,
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
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(acceptFile);
      // A drop the picker can't use passes on to the zone around it.
      if (files.length === 0 || disabled) return;
      e.preventDefault();
      void addFiles(files);
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
        if (files.length > 0) void addFiles(files);
      }}
    />
  );

  return {
    busy,
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
