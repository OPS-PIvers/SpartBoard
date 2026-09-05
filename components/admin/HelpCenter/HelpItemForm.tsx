import React, { useId, useState } from 'react';
import { Link2, GraduationCap, Search } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Toggle } from '@/components/common/Toggle';
import { TOOLS } from '@/config/tools';
import {
  inferHelpEmbedType,
  isAllowedHelpUrl,
  toHelpEmbedSrc,
  helpIframeSandbox,
} from '@/utils/helpEmbed';
import type { WidgetType, InternalToolType } from '@/types';
import type { HelpCategory, HelpResourceItem } from '@/types/helpCenter';
import type { HelpItemDraft } from './helpCenterAdmin';
import { GuidedLearningPicker } from './GuidedLearningPicker';

const INTERNAL_TOOL_TYPES: ReadonlySet<InternalToolType> = new Set([
  'record',
  'magic',
  'remote',
]);

interface HelpItemFormProps {
  isOpen: boolean;
  editing: HelpResourceItem | null;
  categories: HelpCategory[];
  onClose: () => void;
  onSave: (draft: HelpItemDraft) => Promise<void>;
}

const emptyDraft = (categoryId: string): HelpItemDraft => ({
  kind: 'embed',
  title: '',
  description: '',
  categoryId,
  widgetTypes: [],
  visible: true,
  url: '',
  embedType: null,
  setId: null,
});

const toDraft = (item: HelpResourceItem): HelpItemDraft => ({
  kind: item.kind,
  title: item.title,
  description: item.description,
  categoryId: item.categoryId,
  widgetTypes: item.widgetTypes,
  visible: item.visible,
  url: item.url ?? '',
  embedType: item.embedType,
  setId: item.setId,
});

export const HelpItemForm: React.FC<HelpItemFormProps> = ({
  isOpen,
  editing,
  categories,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<HelpItemDraft>(() =>
    editing ? toDraft(editing) : emptyDraft(categories[0]?.id ?? '')
  );
  const [widgetSearch, setWidgetSearch] = useState('');
  const relatedWidgetsLabelId = useId();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const url = draft.url ?? '';
  const urlValid = url.length > 0 && isAllowedHelpUrl(url);
  const embedType = urlValid ? inferHelpEmbedType(url) : null;
  const previewSrc = urlValid ? toHelpEmbedSrc(url) : '';
  const canSave =
    draft.title.trim().length > 0 &&
    draft.categoryId.length > 0 &&
    (draft.kind === 'embed' ? urlValid : Boolean(draft.setId));

  const patch = (next: Partial<HelpItemDraft>) =>
    setDraft((prev) => ({ ...prev, ...next }));

  const toggleWidgetType = (type: WidgetType) =>
    setDraft((prev) => ({
      ...prev,
      widgetTypes: prev.widgetTypes.includes(type)
        ? prev.widgetTypes.filter((t) => t !== type)
        : [...prev.widgetTypes, type],
    }));

  const handleSave = async () => {
    if (!canSave) {
      setError('Fill in a title and a valid https link before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, embedType });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const isWidgetTool = (
    tool: (typeof TOOLS)[number]
  ): tool is (typeof TOOLS)[number] & { type: WidgetType } =>
    !INTERNAL_TOOL_TYPES.has(tool.type as InternalToolType);

  const visibleTools = TOOLS.filter(isWidgetTool).filter((tool) =>
    tool.label.toLowerCase().includes(widgetSearch.toLowerCase().trim())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit help item' : 'Add help item'}
      maxWidth="max-w-3xl"
      className="max-h-[88vh]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-2 text-sm rounded-lg bg-brand-blue-primary text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div
          className="inline-flex rounded-lg border border-slate-300 overflow-hidden"
          role="group"
          aria-label="Item kind"
        >
          {(
            [
              { kind: 'embed' as const, label: 'Embed', icon: Link2 },
              {
                kind: 'guided-learning' as const,
                label: 'Guided Learning activity',
                icon: GraduationCap,
              },
            ] satisfies {
              kind: HelpResourceItem['kind'];
              label: string;
              icon: typeof Link2;
            }[]
          ).map(({ kind, label, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={draft.kind === kind}
              onClick={() => patch({ kind })}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${
                draft.kind === kind
                  ? 'bg-brand-blue-primary text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {draft.kind === 'embed' ? (
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-slate-700"
              htmlFor="help-item-url"
            >
              Link
            </label>
            <input
              id="help-item-url"
              type="url"
              value={url}
              onChange={(e) => patch({ url: e.target.value })}
              onBlur={() => {
                if (url.length > 0 && !isAllowedHelpUrl(url))
                  setError('Links must start with https://');
                else setError(null);
              }}
              placeholder="https://docs.google.com/document/d/..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <div className="flex items-center gap-2">
              {embedType && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                  {embedType}
                </span>
              )}
              <p className="text-xs text-slate-500">
                Google files must be shared with anyone with the link.
              </p>
            </div>
            {urlValid && (
              <iframe
                title="Help item preview"
                src={previewSrc}
                sandbox={helpIframeSandbox(embedType)}
                referrerPolicy="strict-origin-when-cross-origin"
                className="w-full h-56 rounded-lg border border-slate-200 bg-slate-50"
              />
            )}
          </div>
        ) : (
          <GuidedLearningPicker
            selectedSetId={draft.setId}
            onSelect={(setId) => patch({ setId })}
            onError={setError}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label
              className="block text-sm font-medium text-slate-700 mb-1"
              htmlFor="help-item-title"
            >
              Title
            </label>
            <input
              id="help-item-title"
              type="text"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium text-slate-700 mb-1"
              htmlFor="help-item-category"
            >
              Category
            </label>
            {categories.length === 0 && (
              <p className="text-sm text-amber-700 mb-1">
                No categories yet. A super admin needs to open this tab first.
              </p>
            )}
            <select
              id="help-item-category"
              value={draft.categoryId}
              onChange={(e) => patch({ categoryId: e.target.value })}
              disabled={categories.length === 0}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:opacity-50"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-slate-700 mb-1"
            htmlFor="help-item-description"
          >
            Description
          </label>
          <textarea
            id="help-item-description"
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <span
            id={relatedWidgetsLabelId}
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Related widgets
          </span>
          <div className="relative mb-2">
            <Search
              aria-hidden="true"
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              type="text"
              value={widgetSearch}
              onChange={(e) => setWidgetSearch(e.target.value)}
              placeholder="Search widgets..."
              aria-label="Search widgets"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div
            role="group"
            aria-labelledby={relatedWidgetsLabelId}
            className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 grid grid-cols-2 gap-1"
          >
            {visibleTools.map((tool) => (
              <label
                key={tool.type}
                className="flex items-center gap-2 text-sm text-slate-700 px-1 py-0.5"
              >
                <input
                  type="checkbox"
                  checked={draft.widgetTypes.includes(tool.type)}
                  onChange={() => toggleWidgetType(tool.type)}
                />
                {tool.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Toggle
            checked={draft.visible}
            onChange={(visible) => patch({ visible })}
            label="Visible to teachers"
            size="sm"
          />
          <span className="text-sm text-slate-700">Visible to teachers</span>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
