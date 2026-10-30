import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  FileText,
  FileUp,
  Globe,
  Link2,
  Type,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useFileDrop } from '@/hooks/useFileDrop';
import { tourAttr } from '@/config/tourAnchors';
import type { ImportInboxItem, ImportTarget } from '@/utils/import/contract';
import type { PendingSource } from './importHandoff';
import { importRoute, targetChoices } from './importTargets';
import { sourceFromInboxItem } from './sourceFromInbox';

interface ImportScreenProps {
  isOpen: boolean;
  onClose: () => void;
  /** A Source handed in by a drop or a Send; skips the source step. */
  initialSource?: PendingSource;
  presetTarget?: ImportTarget;
  /** Pages the extension sent (S1 inbox), newest first. */
  inboxItems: readonly ImportInboxItem[];
  onRemoveInboxItem: (id: string) => void;
  /** Targets this teacher may use for this Source (widget access and import gates). */
  allowed: (target: ImportTarget, source: PendingSource) => boolean;
  /** From a widget's own Import button: opens that widget's import options instead. */
  widgetOptions?: { label: string; open: () => void };
  onContinue: (source: PendingSource, target: ImportTarget) => void;
}

const sourceButtonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:opacity-40';

const primaryButtonClass =
  'inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed';

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

function describeSource(source: PendingSource): {
  icon: React.ReactNode;
  title: string;
  detail: string;
} {
  if (source.file)
    return {
      icon: <FileText className="h-4 w-4" />,
      title: source.file.name,
      detail: 'File',
    };
  if (source.inboxItem && source.url)
    return {
      icon: <Globe className="h-4 w-4" />,
      title: source.title?.trim() ? source.title : hostOf(source.url),
      detail: `Sent from ${hostOf(source.url)}`,
    };
  if (source.url)
    return {
      icon: <Link2 className="h-4 w-4" />,
      title: source.url,
      detail: 'Link',
    };
  return {
    icon: <Type className="h-4 w-4" />,
    title: (source.text ?? '').trim().split(/\r?\n/)[0] ?? '',
    detail: 'Pasted text',
  };
}

const parsePastedLink = (value: string): string | null => {
  const trimmed = value.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
};

export const ImportScreen: React.FC<ImportScreenProps> = ({
  isOpen,
  onClose,
  initialSource,
  presetTarget,
  inboxItems,
  onRemoveInboxItem,
  allowed,
  widgetOptions,
  onContinue,
}) => {
  const [source, setSource] = useState<PendingSource | null>(
    initialSource ?? null
  );
  const [picked, setPicked] = useState<ImportTarget | null>(null);
  const [link, setLink] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const choose = (next: PendingSource): void => {
    setSource(next);
    setPicked(null);
    setError(null);
  };

  const fileDrop = useFileDrop((file) => choose({ file }), false);

  const choices = source
    ? targetChoices(source, allowed)
    : { targets: [], guess: null };
  const preset =
    presetTarget && choices.targets.includes(presetTarget)
      ? presetTarget
      : null;
  const selected =
    picked && choices.targets.includes(picked)
      ? picked
      : (preset ?? choices.guess);

  const submitLink = (): void => {
    const url = parsePastedLink(link);
    if (!url) {
      setError('Paste a link that starts with https://');
      return;
    }
    choose({ url, sourceUrl: url });
  };

  const submitText = (): void => {
    if (!text.trim()) return;
    choose({ text });
  };

  const sourceStep = (
    <div className="space-y-5">
      {inboxItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
            Sent from your browser
          </p>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {inboxItems.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => choose(sourceFromInboxItem(item))}
                  {...tourAttr('import-screen.sent-item')}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left hover:bg-slate-100"
                >
                  <Globe className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {hostOf(item.url)}
                      {item.selectionOnly ? ' · Selected text' : ''}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveInboxItem(item.id)}
                  aria-label={`Remove ${item.title}`}
                  {...tourAttr('import-screen.sent-remove')}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div
        {...fileDrop.dropProps}
        data-testid="import-screen-drop"
        className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
          fileDrop.dragging
            ? 'border-brand-blue-primary bg-brand-blue-lighter/70'
            : 'border-slate-300 bg-white'
        }`}
      >
        <p className="text-sm font-bold text-slate-800">
          {fileDrop.dragging ? 'Drop it here' : 'Drop a file here'}
        </p>
        <p className="text-xs text-slate-500">
          PDF, Word, CSV, Notebook, Guided Learning or Mini App files
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          {...tourAttr('import-screen.choose-file')}
          className={`mt-1 ${sourceButtonClass}`}
        >
          <FileUp className="h-3.5 w-3.5" />
          Choose file
        </button>
        {/* no-tour-anchor: hidden input; tours point at the Choose file button */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (file) choose({ file });
          }}
          className="hidden"
          aria-label="Choose a file to import"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="import-screen-link"
          className="text-xs font-black uppercase tracking-widest text-slate-500"
        >
          Paste a link
        </label>
        <div className="flex gap-2">
          <input
            id="import-screen-link"
            type="url"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitLink();
            }}
            placeholder="https://"
            {...tourAttr('import-screen.link')}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={submitLink}
            disabled={!link.trim()}
            {...tourAttr('import-screen.link-next')}
            className={sourceButtonClass}
          >
            Next
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="import-screen-text"
          className="text-xs font-black uppercase tracking-widest text-slate-500"
        >
          Paste text
        </label>
        <textarea
          id="import-screen-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Terms and definitions, one pair per line"
          {...tourAttr('import-screen.text')}
          className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submitText}
            disabled={!text.trim()}
            {...tourAttr('import-screen.text-next')}
            className={sourceButtonClass}
          >
            Next
          </button>
        </div>
      </div>
      {widgetOptions && (
        <button
          type="button"
          onClick={widgetOptions.open}
          {...tourAttr('import-screen.widget-options')}
          className="text-sm font-bold text-brand-blue-primary hover:underline"
        >
          More {widgetOptions.label} import options
        </button>
      )}
    </div>
  );

  const described = source ? describeSource(source) : null;

  const targetStep = described && (
    <div className="space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <span className="text-slate-400">{described.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-800">
            {described.title}
          </span>
          <span className="block text-xs text-slate-500">
            {described.detail}
          </span>
        </span>
      </div>

      {choices.targets.length === 0 ? (
        <p className="text-sm text-slate-600" role="status">
          SpartBoard can’t import this yet.
        </p>
      ) : (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-xs font-black uppercase tracking-widest text-slate-500">
            Make it into
          </legend>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {choices.targets.map((target) => {
              const route = importRoute(target);
              if (!route) return null;
              return (
                <label
                  key={target}
                  className="flex cursor-pointer items-center gap-3 py-2.5 hover:bg-slate-100"
                >
                  <input
                    type="radio"
                    name="import-target"
                    value={target}
                    checked={selected === target}
                    onChange={() => setPicked(target)}
                    {...tourAttr('import-screen.target')}
                    className="h-4 w-4 accent-brand-blue-primary"
                  />
                  <span className="flex-1 text-sm font-bold text-slate-800">
                    {route.label}
                  </span>
                  <span className="text-xs text-slate-500">
                    {route.landing === 'review'
                      ? 'Saves to your library'
                      : 'Goes on this board'}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );

  const footer = source ? (
    <div className="flex items-center justify-between gap-2 px-6 py-3 bg-white">
      <button
        type="button"
        onClick={() => {
          setSource(null);
          setPicked(null);
          setError(null);
        }}
        {...tourAttr('import-screen.back')}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>
      <button
        type="button"
        disabled={!selected}
        onClick={() => {
          if (selected) onContinue(source, selected);
        }}
        {...tourAttr('import-screen.continue')}
        className={primaryButtonClass}
      >
        Continue
      </button>
    </div>
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      customHeader={
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0 bg-white rounded-t-2xl">
          <h3
            id="import-screen-title"
            className="font-black text-lg text-slate-800"
          >
            Import
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            aria-label="Close import"
            {...tourAttr('import-screen.close')}
          >
            <X size={20} />
          </button>
        </div>
      }
      footer={footer}
      footerClassName="shrink-0 border-t border-slate-200 rounded-b-2xl"
      maxWidth="max-w-lg"
      className="font-sans"
      contentClassName="px-6 py-5 bg-slate-50"
      ariaLabelledby="import-screen-title"
      zIndex="z-dialog"
    >
      {error && (
        <p role="alert" className="mb-3 text-sm font-semibold text-brand-red">
          {error}
        </p>
      )}
      {source ? targetStep : sourceStep}
    </Modal>
  );
};
