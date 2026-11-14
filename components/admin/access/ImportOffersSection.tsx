import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  ChevronDown,
  CirclePlay,
  ClipboardList,
  FileCode,
  FileSpreadsheet,
  FileText,
  Image,
  Library,
  Link2,
  PenLine,
  Presentation,
  Sparkles,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { db } from '@/config/firebase';
import { tourFieldAttr } from '@/config/tourAnchors';
import { Toggle } from '@/components/common/Toggle';
import { useImportConversionSettings } from '@/hooks/useImportConversionSettings';
import {
  IMPORT_CONVERSION_SETTINGS_DOC,
  IMPORT_SOURCE_KINDS,
  IMPORT_SOURCE_TARGETS,
  IMPORT_AI_DAILY_LIMIT_MAX,
  importAiDailyLimit,
  importAiOn,
  importSourceChecked,
  isImportAiTarget,
  legacyAiSwitch,
  type ImportAiTarget,
  type ImportConversionSettings,
  type ImportSourceKind,
} from '@/config/importConversion';
import {
  IMPORT_TARGET_FEATURES,
  importRoute,
} from '@/components/import/importTargets';
import type { ImportTarget } from '@/utils/import/contract';
import type { GlobalFeaturePermission } from '@/types';
import type { useGlobalPermissionsEditor } from './useGlobalPermissionsEditor';

const SOURCES: Record<
  ImportSourceKind,
  { label: string; hint: string; Icon: LucideIcon }
> = {
  web: {
    label: 'Web link',
    hint: 'A page address pasted or dropped on the board.',
    Icon: Link2,
  },
  youtube: {
    label: 'YouTube video',
    hint: 'A YouTube link.',
    Icon: CirclePlay,
  },
  spreadsheet: {
    label: 'Spreadsheet',
    hint: 'A CSV file.',
    Icon: FileSpreadsheet,
  },
  document: {
    label: 'Document or PDF',
    hint: 'Word, Google Docs or PDF files.',
    Icon: FileText,
  },
  picture: { label: 'Picture', hint: 'A photo or image file.', Icon: Image },
  form: {
    label: 'Google Form',
    hint: 'A form sent with the Chrome extension.',
    Icon: ClipboardList,
  },
  slides: {
    label: 'Slides',
    hint: 'PowerPoint files or Google Slides links.',
    Icon: Presentation,
  },
  webPageFile: {
    label: 'Web page file',
    hint: 'An HTML file.',
    Icon: FileCode,
  },
  course: {
    label: 'Schoology course export',
    hint: 'A whole course exported from Schoology.',
    Icon: Library,
  },
  notebook: {
    label: 'SMART Notebook',
    hint: 'A Notebook file.',
    Icon: PenLine,
  },
  text: { label: 'Pasted text', hint: 'Text pasted on the board.', Icon: Type },
};

const labelOf = (target: ImportTarget): string =>
  importRoute(target)?.label ?? target;

/** "Preview: admins" for a widget still rolling out; null once it has launched for everyone. */
const previewTag = (
  permission: GlobalFeaturePermission | null
): string | null => {
  if (!permission) return null;
  if (!permission.enabled) return 'Preview: off';
  if (permission.accessLevel === 'admin') return 'Preview: admins';
  if (permission.accessLevel === 'beta') {
    const n = permission.betaUsers.length;
    return `Preview: admins and ${n} tester${n === 1 ? '' : 's'}`;
  }
  return null;
};

type Save = (patch: Record<string, unknown>) => Promise<void>;

const LimitField: React.FC<{
  target: ImportAiTarget;
  value: number;
  disabled: boolean;
  anchorKey: string;
  onSave: (limit: number) => void;
}> = ({ target, value, disabled, anchorKey, onSave }) => {
  // Raw text while editing so the field can be emptied; null shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (
      Number.isInteger(n) &&
      n >= 1 &&
      n <= IMPORT_AI_DAILY_LIMIT_MAX &&
      n !== value
    )
      onSave(n);
  };
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-600">
      Daily limit
      <input
        type="number"
        min={1}
        max={IMPORT_AI_DAILY_LIMIT_MAX}
        value={draft ?? String(value)}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        aria-label={`${labelOf(target)} with AI daily limit`}
        {...tourFieldAttr('admin.previews.import-ai-limit', 'admin', anchorKey)}
        className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm disabled:opacity-50"
      />
    </label>
  );
};

const WidgetRow: React.FC<{
  kind: ImportSourceKind;
  target: ImportTarget;
  settings: ImportConversionSettings;
  only: boolean;
  tag: string | null;
  legacyLimit: unknown;
  saving: boolean;
  save: Save;
}> = ({ kind, target, settings, only, tag, legacyLimit, saving, save }) => {
  const off = settings.sources[kind].off;
  const checked = !off.includes(target);
  const label = labelOf(target);
  const key = `${kind}:${target}`;
  // A CSV is read as rows, never by AI.
  const ai = kind !== 'spreadsheet' && isImportAiTarget(target) ? target : null;
  const aiChecked = !!ai && importAiOn(settings, ai);
  const setAi = (patch: { enabled?: boolean; dailyLimit?: number }) => {
    if (!ai) return;
    const next: ImportConversionSettings = {
      ...settings,
      ai: { ...settings.ai, [ai]: { ...settings.ai[ai], ...patch } },
    };
    void save({ ai: { [ai]: patch }, enabled: legacyAiSwitch(next) });
  };
  return (
    <div className="py-2">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={saving}
          onChange={(e) =>
            void save({
              sources: {
                [kind]: {
                  off: e.target.checked
                    ? off.filter((t) => t !== target)
                    : [...off, target],
                },
              },
            })
          }
          {...tourFieldAttr('admin.previews.import-widget', 'admin', key)}
          className="h-4 w-4 accent-brand-blue-primary"
        />
        <span className="flex-1 text-sm font-semibold text-slate-800">
          {label}
        </span>
        {tag ? (
          <span className="text-xxs text-amber-700">{tag}</span>
        ) : (
          only &&
          checked && (
            <span className="text-xxs text-slate-500">
              Adds straight to the board
            </span>
          )
        )}
      </label>
      {ai && checked && (
        <div className="ml-7 mt-2 flex items-center gap-3 border-l-2 border-slate-200 pl-3">
          <Sparkles className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800">
              {label} with AI
            </span>
            <span className="block text-xxs text-slate-500">
              AI writes the {label.toLowerCase()} from the page text. Counts
              toward the daily AI limit.
            </span>
          </span>
          {aiChecked && (
            <LimitField
              target={ai}
              value={importAiDailyLimit(settings, ai, legacyLimit)}
              disabled={saving}
              anchorKey={key}
              onSave={(dailyLimit) => setAi({ dailyLimit })}
            />
          )}
          <Toggle
            checked={aiChecked}
            disabled={saving}
            onChange={(enabled) => setAi({ enabled })}
            size="sm"
            label={`${label} with AI`}
            anchor={tourFieldAttr(
              'admin.previews.import-ai-switch',
              'admin',
              key
            )}
          />
        </div>
      )}
    </div>
  );
};

const SourceRow: React.FC<{
  kind: ImportSourceKind;
  settings: ImportConversionSettings;
  tagFor: (target: ImportTarget) => string | null;
  legacyLimit: unknown;
  saving: boolean;
  save: Save;
}> = ({ kind, settings, tagFor, legacyLimit, saving, save }) => {
  const [open, setOpen] = useState(false);
  const { label, hint, Icon } = SOURCES[kind];
  const picked = importSourceChecked(settings, kind);
  const panelId = `import-source-${kind}`;
  return (
    <div className="bg-white" data-testid={`import-source-${kind}`}>
      <div className="flex items-center gap-3 p-3">
        <span className="shrink-0 rounded-lg bg-brand-blue-lighter p-2 text-brand-blue-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          {...tourFieldAttr('admin.previews.import-source', 'admin', kind)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-800">
              {label}
            </span>
            <span className="block truncate text-xxs text-slate-500">
              {hint}{' '}
              {picked.length > 0
                ? `Offers ${picked.map(labelOf).join(', ')}.`
                : 'Offers nothing.'}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        <Toggle
          checked={settings.sources[kind].enabled}
          disabled={saving}
          onChange={(enabled) =>
            void save({ sources: { [kind]: { enabled } } })
          }
          size="sm"
          label={label}
          anchor={tourFieldAttr(
            'admin.previews.import-source-switch',
            'admin',
            kind
          )}
        />
      </div>
      {open && (
        <div
          id={panelId}
          className="divide-y divide-slate-100 border-t border-slate-100 px-3 pb-2 pl-14"
        >
          {IMPORT_SOURCE_TARGETS[kind].map((target) => (
            <WidgetRow
              key={target}
              kind={kind}
              target={target}
              settings={settings}
              only={picked.length === 1}
              tag={tagFor(target)}
              legacyLimit={legacyLimit}
              saving={saving}
              save={save}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** What each kind of import offers, with AI per widget (Previews > Import anything). */
export const ImportOffersSection: React.FC<{
  editor: ReturnType<typeof useGlobalPermissionsEditor>;
}> = ({ editor }) => {
  const settings = useImportConversionSettings();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save: Save = async (patch) => {
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'admin_settings', IMPORT_CONVERSION_SETTINGS_DOC),
        patch,
        { merge: true }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };
  const tagFor = (target: ImportTarget): string | null => {
    const flag = IMPORT_TARGET_FEATURES[target];
    return flag ? previewTag(editor.getPermission(flag)) : null;
  };
  const legacyLimit =
    editor.getPermission('universal-import').config?.dailyLimit;
  return (
    <div className="space-y-1" data-testid="import-offers">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
        What each import offers
      </p>
      {error && (
        <p className="text-xs text-brand-red-primary" role="alert">
          {error}
        </p>
      )}
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {IMPORT_SOURCE_KINDS.map((kind) => (
          <SourceRow
            key={kind}
            kind={kind}
            settings={settings}
            tagFor={tagFor}
            legacyLimit={legacyLimit}
            saving={saving}
            save={save}
          />
        ))}
      </div>
    </div>
  );
};
