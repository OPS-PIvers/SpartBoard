import React, { useState } from 'react';
import { FileText, Globe, Link2, Type, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourAttr } from '@/config/tourAnchors';
import { TOOLS } from '@/config/tools';
import type { ImportInboxItem, ImportTarget } from '@/utils/import/contract';
import type { PendingSource } from './importHandoff';
import { importRoute, targetChoices } from './importTargets';
import { sourceFromInboxItem } from './sourceFromInbox';

interface ImportScreenProps {
  isOpen: boolean;
  onClose: () => void;
  /** Something dropped on the board; listed above any sent pages. */
  initialSource?: PendingSource;
  /** Pages the extension sent (S1 inbox), newest first. */
  inboxItems: readonly ImportInboxItem[];
  onRemoveInboxItem: (id: string) => void;
  /** Targets this teacher may use for this Source (widget access and import gates). */
  allowed: (target: ImportTarget, source: PendingSource) => boolean;
  onContinue: (source: PendingSource, target: ImportTarget) => void;
}

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
}

export const ImportScreen: React.FC<ImportScreenProps> = ({
  isOpen,
  onClose,
  initialSource,
  inboxItems,
  onRemoveInboxItem,
  allowed,
  onContinue,
}) => {
  const rows: Row[] = [
    ...(initialSource && !initialSource.inboxItem
      ? [{ key: 'dropped', source: initialSource }]
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
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-slate-600" role="status">
          Nothing is waiting to be added.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {rows.map((row) => (
            <SourceRow
              key={row.key}
              source={row.source}
              allowed={allowed}
              onPick={(target) => onContinue(row.source, target)}
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

const toolFor = (widgetType: string) =>
  TOOLS.find((tool) => tool.type === widgetType);

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
  allowed: ImportScreenProps['allowed'];
  onPick: (target: ImportTarget) => void;
  onRemove?: () => void;
}> = ({ source, allowed, onPick, onRemove }) => {
  const described = describeSource(source);
  const { targets, guess } = targetChoices(source, allowed);
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
                {described.detail}
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
          {targets.length === 0 ? (
            <p className="text-sm text-slate-600" role="status">
              SpartBoard can’t import this yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {targets.map((target) => {
                const route = importRoute(target);
                if (!route) return null;
                const tool = toolFor(route.widgetType);
                const Icon = tool?.icon ?? Globe;
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
                      className={`flex h-6 w-6 items-center justify-center rounded-md text-white ${tool?.color ?? 'bg-slate-500'}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {route.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};
