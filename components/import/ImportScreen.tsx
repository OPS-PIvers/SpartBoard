import React, { useState } from 'react';
import {
  FileText,
  FolderTree,
  Globe,
  Image,
  LayoutTemplate,
  Link2,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourAttr } from '@/config/tourAnchors';
import { TOOLS } from '@/config/tools';
import type { ImportInboxItem, ImportTarget } from '@/utils/import/contract';
import type { PendingSource } from './importHandoff';
import type { DroppedPage } from './fetchImportPage';
import { importRoute, targetChoices, usesAi } from './importTargets';
import { AI_CONVERSION_LIMIT_NOTE } from '@/utils/import/aiConversion';
import { sourceFromInboxItem } from './sourceFromInbox';
import { ReferenceEmbedStep } from './reference/ReferenceEmbedStep';
import type { ReferenceWidget } from './reference/referenceLanding';

interface ImportScreenProps {
  isOpen: boolean;
  onClose: () => void;
  /** Something dropped on the board; listed above any sent pages. */
  initialSource?: PendingSource;
  /** The server's read of a dropped link, while and after it runs. */
  droppedPage?: DroppedPage | null;
  /** Pages the extension sent (S1 inbox), newest first. */
  inboxItems: readonly ImportInboxItem[];
  onRemoveInboxItem: (id: string) => void;
  /** Targets this teacher may use for this Source (widget access and import gates). */
  allowed: (target: ImportTarget, source: PendingSource) => boolean;
  /** AI Conversions are on for this teacher (switch, flags and view-as). */
  aiOn?: boolean;
  onContinue: (source: PendingSource, target: ImportTarget) => void;
  /** Places what the Embed check built (an Embed, or a Link when the page refuses framing). */
  onPlaceReference: (widget: ReferenceWidget, source: PendingSource) => void;
  /** False hides the Embed check's "Add as a link" when Links is off for this teacher. */
  canAddLink?: boolean;
  /** Opens the whole-course checklist for a Schoology course export; absent when it isn't offered. */
  onCourse?: (file: File) => void;
}

const COURSE_EXPORT = /\.imscc$/i;

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
      detail: source.inboxItem.selectionOnly
        ? `${hostOf(source.url)} · Selected text`
        : hostOf(source.url),
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
    detail: 'Text',
  };
}

interface Row {
  key: string;
  source: PendingSource;
  removeId?: string;
  /** Replaces the row's detail line, e.g. while its page is read. */
  detail?: string;
  note?: string;
}

const PAGE_NOTES: Partial<Record<DroppedPage['status'], string>> = {
  blocked: 'Your district doesn’t allow importing from this site.',
  'use-extension':
    'To use what’s on this page, send it with the SpartBoard extension.',
};

export const ImportScreen: React.FC<ImportScreenProps> = ({
  isOpen,
  onClose,
  initialSource,
  droppedPage,
  inboxItems,
  onRemoveInboxItem,
  allowed,
  aiOn = false,
  onContinue,
  onPlaceReference,
  canAddLink = true,
  onCourse,
}) => {
  // The page being checked for Embed, and rows whose page refused it.
  const [embedding, setEmbedding] = useState<Row | null>(null);
  const [noEmbed, setNoEmbed] = useState<ReadonlySet<string>>(new Set());
  // Convert is offered only when the row has a target besides Embed and Link.
  const canConvert = (row: Row): boolean =>
    targetChoices(row.source, allowed, aiOn).targets.some(
      (t) => t !== 'embed' && t !== 'links'
    );
  const rows: Row[] = [
    ...(initialSource && !initialSource.inboxItem
      ? [
          {
            key: 'dropped',
            source:
              droppedPage?.status === 'read'
                ? {
                    ...sourceFromInboxItem(droppedPage.item),
                    // Embed and Link keep the exact link dropped, not the server's final address.
                    url: initialSource.url,
                    sourceUrl: initialSource.url,
                    readFromLink: true,
                  }
                : initialSource,
            ...(droppedPage?.status === 'reading'
              ? { detail: 'Reading this page…' }
              : {}),
            ...(droppedPage && PAGE_NOTES[droppedPage.status]
              ? { note: PAGE_NOTES[droppedPage.status] }
              : {}),
          },
        ]
      : []),
    ...inboxItems.map((item) => ({
      key: item.id,
      source: sourceFromInboxItem(item),
      removeId: item.id,
    })),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      customHeader={
        <div className="flex items-center justify-between gap-4 px-6 py-4 shrink-0 bg-brand-blue-primary rounded-t-2xl">
          <h3
            id="import-screen-title"
            className="font-black text-lg text-white"
          >
            Add to board
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="relative touch-target-expand p-1.5 hover:bg-white/15 rounded-full text-white/80 hover:text-white transition-colors"
            aria-label="Close"
            {...tourAttr('import-screen.close')}
          >
            <X size={20} />
          </button>
        </div>
      }
      maxWidth="max-w-lg"
      className="font-sans"
      contentClassName="px-6 py-2 bg-white"
      ariaLabelledby="import-screen-title"
      zIndex="z-dialog"
    >
      {embedding?.source.url ? (
        <ReferenceEmbedStep
          url={embedding.source.url}
          title={embedding.source.title}
          onPlace={(widget) => onPlaceReference(widget, embedding.source)}
          onConvert={
            canConvert(embedding)
              ? () => {
                  setNoEmbed((prev) => new Set(prev).add(embedding.key));
                  setEmbedding(null);
                }
              : undefined
          }
          canAddLink={canAddLink}
          onCancel={() => setEmbedding(null)}
        />
      ) : rows.length === 0 ? (
        <p className="py-4 text-sm text-slate-600" role="status">
          Nothing is waiting to be added.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {rows.map((row) => (
            <SourceRow
              key={row.key}
              source={row.source}
              aiOn={aiOn}
              detail={row.detail}
              note={row.note}
              allowed={(target, source) =>
                !(target === 'embed' && noEmbed.has(row.key)) &&
                allowed(target, source)
              }
              onPick={(target) =>
                target === 'embed' && row.source.url
                  ? setEmbedding(row)
                  : onContinue(row.source, target)
              }
              onCourse={onCourse}
              onRemove={
                row.removeId
                  ? () => onRemoveInboxItem(row.removeId ?? '')
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </Modal>
  );
};

const toolFor = (widgetType: string | undefined) =>
  widgetType ? TOOLS.find((tool) => tool.type === widgetType) : undefined;

const Thumbnail: React.FC<{ source: PendingSource; icon: React.ReactNode }> = ({
  source,
  icon,
}) => {
  const [broken, setBroken] = useState(false);
  const image = source.inboxItem?.images[0]?.url;
  if (image && !broken)
    return (
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
      />
    );
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 [&>svg]:h-5 [&>svg]:w-5">
      {icon}
    </span>
  );
};

const SourceRow: React.FC<{
  source: PendingSource;
  detail?: string;
  note?: string;
  allowed: ImportScreenProps['allowed'];
  aiOn: boolean;
  onPick: (target: ImportTarget) => void;
  onRemove?: () => void;
  onCourse?: (file: File) => void;
}> = ({ source, detail, note, allowed, aiOn, onPick, onRemove, onCourse }) => {
  const described = describeSource(source);
  const { targets, guess } = targetChoices(source, allowed, aiOn);
  const anyAi = targets.some((t) => usesAi(t, source, aiOn));
  const courseFile =
    onCourse && source.file && COURSE_EXPORT.test(source.file.name)
      ? source.file
      : null;
  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <Thumbnail source={source} icon={described.icon} />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block truncate text-sm font-bold text-slate-800">
                {described.title}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {detail ?? described.detail}
              </span>
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${described.title}`}
                {...tourAttr('import-screen.sent-remove')}
                className="relative touch-target-expand rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {targets.length === 0 && !courseFile ? (
            <p className="text-sm text-slate-600" role="status">
              SpartBoard can’t import this yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {courseFile && (
                <button
                  type="button"
                  onClick={() => onCourse?.(courseFile)}
                  {...tourAttr('import-screen.course')}
                  className="relative touch-target-expand inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white py-1 pl-1 pr-3 text-sm font-bold text-slate-700 transition-colors hover:border-brand-blue-primary hover:text-brand-blue-primary"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-blue-primary text-white">
                    <FolderTree className="h-3.5 w-3.5" />
                  </span>
                  Whole course
                </button>
              )}
              {targets.map((target) => {
                const route = importRoute(target);
                if (!route) return null;
                const tool = toolFor(route.widgetType);
                const Icon =
                  route.landing === 'board'
                    ? LayoutTemplate
                    : (tool?.icon ??
                      (route.widgetType === 'sticker' ? Image : Globe));
                const ai = usesAi(target, source, aiOn);
                return (
                  <button
                    key={target}
                    type="button"
                    onClick={() => onPick(target)}
                    {...tourAttr('import-screen.target')}
                    className={`relative touch-target-expand inline-flex items-center gap-2 rounded-lg border py-1 pl-1 pr-3 text-sm font-bold transition-colors ${
                      target === guess
                        ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary hover:bg-brand-blue-lighter/70'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-brand-blue-primary hover:text-brand-blue-primary'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-md text-white ${tool?.color ?? 'bg-brand-blue-primary'}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {route.label}
                    {ai && (
                      <>
                        <Sparkles
                          className="h-3.5 w-3.5 text-slate-400"
                          aria-hidden="true"
                        />
                        <span className="sr-only">(uses AI)</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {note && <p className="text-xs text-slate-600">{note}</p>}
          {anyAi && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {AI_CONVERSION_LIMIT_NOTE}
            </p>
          )}
        </div>
      </div>
    </li>
  );
};
