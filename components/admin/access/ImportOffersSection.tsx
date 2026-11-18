import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  Archive,
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
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { tourFieldAttr } from '@/config/tourAnchors';
import { Toggle } from '@/components/common/Toggle';
import { useImportConversionSettings } from '@/hooks/useImportConversionSettings';
import { useQuizDocumentImportSettings } from '@/hooks/useQuizDocumentImportSettings';
import {
  IMPORT_CONVERSION_SETTINGS_DOC,
  IMPORT_SOURCE_KINDS,
  IMPORT_SOURCE_TARGETS,
  IMPORT_AI_DAILY_LIMIT_MAX,
  IMPORT_AI_TARGETS,
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
  IMPORT_SOURCE_FEATURES,
  IMPORT_WAYS_IN,
  importRoute,
  importRowFeature,
} from '@/components/import/importTargets';
import type { ImportTarget } from '@/utils/import/contract';
import type { GlobalFeature, GlobalFeaturePermission } from '@/types';
import { BetaUsersPanel } from '@/components/admin/BetaUsersPanel';
import { AccessLevelPicker } from './AccessFeatureRow';
import {
  featureSearchFields,
  groupChildLabel,
  matchesSearch,
} from './accessSearch';
import { useAccessSearch } from './accessSearchContext';
import { isReadyToGraduate } from './previewStatus';
import { retireIssueUrl } from './retireIssue';
import type { useGlobalPermissionsEditor } from './useGlobalPermissionsEditor';

type Editor = ReturnType<typeof useGlobalPermissionsEditor>;

const sourceFeature = (kind: ImportSourceKind): GlobalFeature | undefined =>
  (IMPORT_SOURCE_FEATURES as Partial<Record<ImportSourceKind, GlobalFeature>>)[
    kind
  ];

const SOURCES: Record<
  ImportSourceKind,
  { label: string; hint: string; Icon: LucideIcon }
> = {
  web: {
    label: 'Web link',
    hint: 'A link dropped on the board or sent with the Chrome extension.',
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
    hint: 'Word or PDF files.',
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
  text: {
    label: 'Dropped text',
    hint: 'Text dragged onto the board.',
    Icon: Type,
  },
};

/** A lone widget is placed for the teacher only when it reads without AI and needs no sign-in click. */
const addsStraight = (kind: ImportSourceKind, target: ImportTarget): boolean =>
  kind !== 'form' &&
  target !== 'activityWall' &&
  target !== 'board' &&
  (target !== 'flashcards' || kind === 'spreadsheet');

const labelOf = (target: ImportTarget): string =>
  importRoute(target)?.label ?? target;

// Into the editor first so a second click before the write lands builds on the first.
const saveNow = (
  editor: Editor,
  featureId: GlobalFeature,
  patch: Partial<GlobalFeaturePermission>
): void => {
  editor.updatePermission(featureId, patch);
  void editor.savePermission(featureId);
};

/** Admin, Beta or Public for one preview flag, saved on click, with Retire once it is open to everyone. */
const PreviewAccess: React.FC<{
  featureId: GlobalFeature;
  editor: Editor;
  where?: string;
}> = ({ featureId, editor, where }) => {
  const permission: GlobalFeaturePermission = editor.getPermission(featureId);
  const label = FEATURE_DEFAULTS[featureId].label;
  // The quiz document gate also needs its district switch.
  const quizDocs = useQuizDocumentImportSettings(
    featureId === 'quiz-document-import'
  );
  const off =
    !permission.enabled ||
    (featureId === 'quiz-document-import' && !quizDocs.enabled);
  const ready =
    FEATURE_DEFAULTS[featureId].afterLaunch === 'retire' &&
    isReadyToGraduate(permission, editor.isSaved(featureId), undefined);
  return (
    <span className="flex shrink-0 items-center gap-2">
      {off && <span className="text-xxs text-amber-700">Preview: off</span>}
      {ready && (
        <a
          href={retireIssueUrl(featureId)}
          target="_blank"
          rel="noopener noreferrer"
          title="Opens a GitHub issue asking Claude to remove the old version"
          data-testid={`retire-${featureId}`}
          className="flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2 py-1 text-xs font-bold text-green-800 hover:bg-green-100"
        >
          <Archive className="h-3.5 w-3.5" aria-hidden />
          Retire
        </a>
      )}
      <AccessLevelPicker
        value={permission.accessLevel}
        onChange={(accessLevel) => saveNow(editor, featureId, { accessLevel })}
        label={where ? `${label}, ${where}` : label}
        anchorKey={where ? `${featureId}:${where}` : featureId}
      />
    </span>
  );
};

/** The tester list for a flag at Beta, saved as it changes. */
const PreviewTesters: React.FC<{
  featureId: GlobalFeature;
  editor: Editor;
}> = ({ featureId, editor }) => {
  const permission = editor.getPermission(featureId);
  if (permission.accessLevel !== 'beta') return null;
  return (
    <div className="py-2">
      <BetaUsersPanel
        betaUsers={permission.betaUsers}
        onChange={(betaUsers) => saveNow(editor, featureId, { betaUsers })}
        showMessage={editor.showMessage}
        variant="expanded"
      />
    </div>
  );
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
  editor: Editor;
  legacyLimit: unknown;
  saving: boolean;
  save: Save;
}> = ({ kind, target, settings, only, editor, legacyLimit, saving, save }) => {
  const flag = importRowFeature(kind, target);
  const off = settings.sources[kind].off;
  const checked = !off.includes(target);
  const label = labelOf(target);
  const key = `${kind}:${target}`;
  // A CSV is read as rows, never by AI.
  const ai = kind !== 'spreadsheet' && isImportAiTarget(target) ? target : null;
  const aiChecked = !!ai && importAiOn(settings, ai);
  const setAi = (patch: { enabled?: boolean; dailyLimit?: number }) => {
    if (!ai) return;
    // Widgets still on the old switch get their own value first, so the mirrored switch can't turn them on.
    const pinned = Object.fromEntries(
      IMPORT_AI_TARGETS.map((t) => [
        t,
        {
          ...(settings.ai[t].enabled === undefined
            ? { enabled: importAiOn(settings, t) }
            : {}),
          ...(t === ai ? patch : {}),
        },
      ])
    ) as Record<ImportAiTarget, { enabled?: boolean; dailyLimit?: number }>;
    const next: ImportConversionSettings = {
      ...settings,
      ai: Object.fromEntries(
        IMPORT_AI_TARGETS.map((t) => [t, { ...settings.ai[t], ...pinned[t] }])
      ) as ImportConversionSettings['ai'],
    };
    // An empty map in a merge would replace that widget's saved settings.
    const written = Object.fromEntries(
      Object.entries(pinned).filter(([, v]) => Object.keys(v).length > 0)
    );
    void save({ ai: written, enabled: legacyAiSwitch(next) });
  };
  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-3">
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
          {only && checked && addsStraight(kind, target) && (
            <span className="text-xxs text-slate-500">
              Adds straight to the board
            </span>
          )}
        </label>
        {flag && (
          <PreviewAccess
            featureId={flag}
            editor={editor}
            where={SOURCES[kind].label}
          />
        )}
      </div>
      {flag && <PreviewTesters featureId={flag} editor={editor} />}
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
  editor: Editor;
  legacyLimit: unknown;
  saving: boolean;
  save: Save;
}> = ({ kind, settings, editor, legacyLimit, saving, save }) => {
  const flag = sourceFeature(kind);
  const { query } = useAccessSearch();
  // A search that matches one of this source's widgets opens it until the admin toggles it.
  const [toggled, setOpen] = useState<boolean | null>(null);
  const open =
    toggled ??
    (query.trim() !== '' &&
      IMPORT_SOURCE_TARGETS[kind].some((t) => {
        const f = importRowFeature(kind, t);
        return !!f && matchesSearch(query, featureSearchFields(f));
      }));
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
        {flag && <PreviewAccess featureId={flag} editor={editor} />}
      </div>
      {flag && (
        <div className="pl-14 pr-3">
          <PreviewTesters featureId={flag} editor={editor} />
        </div>
      )}
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
              editor={editor}
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
  editor: Editor;
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
  const legacyLimit =
    editor.getPermission('universal-import').config?.dailyLimit;
  return (
    <div className="space-y-4" data-testid="import-offers">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Ways in
        </p>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {IMPORT_WAYS_IN.map((id) => (
            <div key={id} className="bg-white px-3">
              <div className="flex items-center gap-3 py-2.5">
                <span className="flex-1 text-sm font-bold text-slate-800">
                  {groupChildLabel(id)}
                </span>
                <PreviewAccess featureId={id} editor={editor} />
              </div>
              <PreviewTesters featureId={id} editor={editor} />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1">
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
              editor={editor}
              legacyLimit={legacyLimit}
              saving={saving}
              save={save}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
