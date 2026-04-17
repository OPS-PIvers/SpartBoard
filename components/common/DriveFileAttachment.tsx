import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileText, X, Loader2, HardDrive, AlertCircle } from 'lucide-react';
import { useGooglePicker, PickedFile } from '@/hooks/useGooglePicker';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';

const FILE_TEXT_LIMIT = 30_000;

interface DriveFileAttachmentProps {
  /** Called with extracted text content (or null when file is removed). */
  onFileContent: (content: string | null, fileName: string | null) => void;
  /** Disable the attachment button (e.g. while generating). */
  disabled?: boolean;
  /** Notified when extraction starts/stops so callers can gate Generate. */
  onExtractingChange?: (extracting: boolean) => void;
  className?: string;
}

/**
 * Reusable component that lets users pick a file from Google Drive
 * and extracts its text content for use as AI context.
 *
 * No file data is stored in Firestore — text is extracted client-side
 * and passed to the parent via callback.
 */
export const DriveFileAttachment: React.FC<DriveFileAttachmentProps> = ({
  onFileContent,
  disabled = false,
  onExtractingChange,
  className = '',
}) => {
  const { openPicker, isConnected } = useGooglePicker();
  const { getDriveFileTextContent } = useGoogleDrive();
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFileRef = useRef(false);
  const onFileContentRef = useRef(onFileContent);

  const hasFile = selectedFile !== null && !isExtracting;

  // Track whether a file is currently attached so the cleanup effect
  // can clear parent state on unmount if the overlay closes while a
  // file is still selected.
  useEffect(() => {
    hasFileRef.current = hasFile;
  }, [hasFile]);

  // Keep callback ref fresh to avoid stale closure in cleanup.
  useEffect(() => {
    onFileContentRef.current = onFileContent;
  }, [onFileContent]);

  useEffect(() => {
    onExtractingChange?.(isExtracting);
  }, [isExtracting, onExtractingChange]);

  useEffect(() => {
    return () => {
      if (hasFileRef.current) {
        onFileContentRef.current(null, null);
      }
    };
  }, []);

  const handlePick = useCallback(async () => {
    if (disabled || isExtracting) return;
    setError(null);

    try {
      const file = await openPicker();
      if (!file) return; // User cancelled

      setSelectedFile(file);
      setIsExtracting(true);

      const text = await getDriveFileTextContent(file.id);
      if (!text) {
        setError(
          'Could not extract text from this file. Try a Google Doc, Sheet, Slides, or text file.'
        );
        setSelectedFile(null);
        onFileContent(null, null);
        return;
      }

      const trimmed = text.substring(0, FILE_TEXT_LIMIT);
      onFileContent(trimmed, file.name);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to read file';
      setError(message);
      setSelectedFile(null);
      onFileContent(null, null);
    } finally {
      setIsExtracting(false);
    }
  }, [
    disabled,
    isExtracting,
    openPicker,
    getDriveFileTextContent,
    onFileContent,
  ]);

  const handleRemove = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    onFileContent(null, null);
  }, [onFileContent]);

  if (!isConnected) {
    return null; // Don't show anything if Drive is not connected
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {selectedFile && !isExtracting ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs">
          <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="text-indigo-700 font-medium truncate flex-1">
            {selectedFile.name}
          </span>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="p-0.5 hover:bg-indigo-200 rounded text-indigo-400 hover:text-indigo-600 transition-colors"
            aria-label="Remove attached file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : isExtracting ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="font-medium truncate">
            Reading {selectedFile?.name}...
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePick}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-500 hover:text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 border border-dashed border-indigo-200 hover:border-indigo-300 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <HardDrive className="w-3.5 h-3.5" />
          Attach file from Drive
        </button>
      )}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-500 animate-in slide-in-from-top-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
