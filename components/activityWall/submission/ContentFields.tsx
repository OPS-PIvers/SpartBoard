import React from 'react';
import { Paperclip, X } from 'lucide-react';
import { ACCEPT_BY_TYPE } from './uploadLimits';

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';
const labelClass = 'block text-sm font-semibold text-slate-700 mb-1';

const WORD_MAX_LENGTH = 40;
const TEXT_MAX_LENGTH = 5000;

interface WordFieldProps {
  value: string;
  onChange: (next: string) => void;
}

export const WordField: React.FC<WordFieldProps> = ({ value, onChange }) => (
  <div>
    <label className={labelClass} htmlFor="aw-word">
      Your word or phrase
    </label>
    <input
      id="aw-word"
      className={inputClass}
      value={value}
      maxLength={WORD_MAX_LENGTH}
      placeholder="One word or short phrase"
      onChange={(event) => onChange(event.target.value)}
    />
    <p className="mt-1 text-right text-xs text-slate-500">
      {value.length}/{WORD_MAX_LENGTH}
    </p>
  </div>
);

interface TextFieldProps {
  title: string;
  body: string;
  onTitleChange: (next: string) => void;
  onBodyChange: (next: string) => void;
  /** Upload posts carry a caption title only. */
  hideBody?: boolean;
}

export const TextField: React.FC<TextFieldProps> = ({
  title,
  body,
  onTitleChange,
  onBodyChange,
  hideBody = false,
}) => (
  <div className="space-y-3">
    <div>
      <label className={labelClass} htmlFor="aw-title">
        Title (optional)
      </label>
      <input
        id="aw-title"
        className={inputClass}
        value={title}
        maxLength={120}
        onChange={(event) => onTitleChange(event.target.value)}
      />
    </div>
    {!hideBody && (
      <div>
        <label className={labelClass} htmlFor="aw-body">
          Your response
        </label>
        <textarea
          id="aw-body"
          rows={4}
          className={inputClass}
          value={body}
          maxLength={TEXT_MAX_LENGTH}
          placeholder="Type your response"
          onChange={(event) => onBodyChange(event.target.value)}
        />
        <p className="mt-1 text-right text-xs text-slate-500">
          {body.length}/{TEXT_MAX_LENGTH}
        </p>
      </div>
    )}
  </div>
);

interface LinkFieldProps {
  url: string;
  title: string;
  onUrlChange: (next: string) => void;
  onTitleChange: (next: string) => void;
}

export const LinkField: React.FC<LinkFieldProps> = ({
  url,
  title,
  onUrlChange,
  onTitleChange,
}) => (
  <div className="space-y-3">
    <div>
      <label className={labelClass} htmlFor="aw-url">
        Link
      </label>
      <input
        id="aw-url"
        type="url"
        inputMode="url"
        className={inputClass}
        value={url}
        placeholder="https://example.com/article"
        onChange={(event) => onUrlChange(event.target.value)}
      />
    </div>
    <div>
      <label className={labelClass} htmlFor="aw-link-title">
        Say something about it (optional)
      </label>
      <input
        id="aw-link-title"
        className={inputClass}
        value={title}
        maxLength={120}
        onChange={(event) => onTitleChange(event.target.value)}
      />
    </div>
  </div>
);

interface FileFieldProps {
  type: 'photo' | 'video' | 'file';
  file: File | null;
  previewUrl: string | null;
  onSelect: (file: File | null) => void;
}

const FIELD_LABEL: Record<'photo' | 'video' | 'file', string> = {
  photo: 'Choose a photo to upload',
  video: 'Choose a video to upload',
  file: 'Choose a file to upload',
};

export const FileField: React.FC<FileFieldProps> = ({
  type,
  file,
  previewUrl,
  onSelect,
}) => (
  <div className="space-y-2">
    <label className="block cursor-pointer">
      <div
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 transition-colors ${
          file
            ? 'border-emerald-400 bg-emerald-50'
            : 'border-slate-300 hover:border-brand-blue-primary'
        }`}
      >
        {type === 'photo' && previewUrl ? (
          <img
            src={previewUrl}
            alt="Preview"
            className="max-h-48 w-full rounded-lg object-contain"
          />
        ) : (
          <>
            <Paperclip className="h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="text-sm font-semibold text-brand-blue-primary">
              {file ? file.name : FIELD_LABEL[type]}
            </p>
          </>
        )}
      </div>
      <input
        type="file"
        accept={ACCEPT_BY_TYPE[type]}
        aria-label={FIELD_LABEL[type]}
        className="sr-only"
        onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
      />
    </label>
    {file && (
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="flex items-center gap-1 text-xs font-semibold text-slate-600 transition-colors hover:text-red-600"
      >
        <X className="h-3 w-3" aria-hidden="true" />
        Remove
      </button>
    )}
  </div>
);
