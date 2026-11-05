import React from 'react';
import { pastedImage } from '@/utils/quizAnswerImages';

export type UploadAnswerImage = (file: File) => Promise<string | null>;

/** File picking and pasting for one editor's answer pictures; `key` names the answer being pictured. */
export function useAnswerImagePicker(
  upload: UploadAnswerImage | undefined,
  onUploaded: (key: string, url: string) => void
) {
  const [uploadingKey, setUploadingKey] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pickKeyRef = React.useRef<string | null>(null);

  const send = async (key: string, file: File) => {
    if (!upload) return;
    setUploadingKey(key);
    try {
      const url = await upload(file);
      if (url) onUploaded(key, url);
    } finally {
      setUploadingKey(null);
    }
  };

  const pick = (key: string) => {
    pickKeyRef.current = key;
    inputRef.current?.click();
  };

  /** Goes on an answer's text box; copied text still pastes as text. */
  const pasteInto =
    (key: string) => (e: React.ClipboardEvent<HTMLInputElement>) => {
      if (!upload) return;
      const file = pastedImage(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      if (uploadingKey === null) void send(key, file);
    };

  const fileInput = upload ? (
    <input
      // no-tour-anchor: hidden file input opened by the Add image button
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        const key = pickKeyRef.current;
        e.target.value = '';
        pickKeyRef.current = null;
        if (file && key) void send(key, file);
      }}
    />
  ) : null;

  return { uploadingKey, pick, pasteInto, fileInput };
}
