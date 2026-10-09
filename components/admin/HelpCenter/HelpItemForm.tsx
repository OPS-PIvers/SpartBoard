import React, { useState } from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { Modal } from '@/components/common/Modal';
import { Toggle } from '@/components/common/Toggle';
import { Link2 } from 'lucide-react';
import { ChecklistSelect } from '@/components/gradebook/settings/ChecklistSelect';
import {
  Btn,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/admin/Organization/components/primitives';
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // While the activity editor is open, Escape and backdrop clicks belong to it.
  const [editorOpen, setEditorOpen] = useState(false);
  const [pickedTitle, setPickedTitle] = useState('');
  const [linkOpen, setLinkOpen] = useState(
    () => editing?.kind === 'embed' && Boolean(editing.url)
  );
  const [changing, setChanging] = useState(false);
  const hasContent = draft.kind === 'embed' ? linkOpen : Boolean(draft.setId);
  const showChoices = changing || !hasContent;

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

  const widgetOptions = TOOLS.filter(isWidgetTool).map((tool) => ({
    id: tool.type,
    label: tool.label,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={editorOpen ? () => undefined : onClose}
      title={editing ? 'Edit help item' : 'Add help item'}
      maxWidth="max-w-2xl"
      className="max-h-[88vh]"
      contentClassName="px-6"
      footerClassName="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-6 py-4"
      footer={
        <>
          <div className="flex items-center gap-3">
            <Toggle
              checked={draft.visible}
              onChange={(visible) => patch({ visible })}
              label="Visible to teachers"
              anchor={tourAttr('admin.help-center.form-visible')}
              size="sm"
            />
            <span className="text-sm text-slate-700">Visible to teachers</span>
          </div>
          <div className="flex items-center gap-2">
            <Btn
              variant="ghost"
              onClick={onClose}
              {...tourAttr('admin.help-center.form-cancel')}
            >
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={handleSave}
              {...tourAttr('admin.help-center.form-save')}
              disabled={!canSave || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </Btn>
          </div>
        </>
      }
    >
      <div className="space-y-5 pb-6">
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
            Content
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {showChoices && (
              <Btn
                size="lg"
                onClick={() => {
                  patch({
                    kind: 'embed',
                    url: draft.kind === 'embed' ? url : '',
                  });
                  setLinkOpen(true);
                  setChanging(false);
                }}
                icon={<Link2 className="w-4 h-4" aria-hidden="true" />}
              >
                Add a link
              </Btn>
            )}
            <GuidedLearningPicker
              mode={
                showChoices
                  ? 'choose'
                  : draft.kind === 'guided-learning'
                    ? 'chosen'
                    : 'hidden'
              }
              onChange={() => setChanging(true)}
              selectedSetId={
                draft.kind === 'guided-learning' ? draft.setId : null
              }
              newTitle={draft.title}
              onSelect={(setId, title) => {
                setPickedTitle(title);
                setChanging(false);
                setLinkOpen(false);
                setDraft((prev) => ({
                  ...prev,
                  kind: 'guided-learning',
                  setId,
                  // Follow the activity's title until the admin types their own.
                  title:
                    !prev.title.trim() || prev.title === pickedTitle
                      ? title
                      : prev.title,
                }));
              }}
              onError={setError}
              onEditingChange={setEditorOpen}
            />
            {showChoices && changing && (
              <button
                type="button"
                onClick={() => setChanging(false)}
                className="px-2 text-sm font-semibold text-slate-600 hover:underline"
              >
                Keep current
              </button>
            )}
          </div>
          {!showChoices && draft.kind === 'embed' && (
            <>
              <div className="flex items-center gap-3">
                <Input
                  id="help-item-url"
                  aria-label="Link"
                  type="url"
                  autoFocus={!url}
                  value={url}
                  onChange={(e) => patch({ url: e.target.value })}
                  onBlur={() => {
                    if (url.length > 0 && !isAllowedHelpUrl(url))
                      setError('Links must start with https://');
                    else setError(null);
                  }}
                  placeholder="https://docs.google.com/document/d/..."
                />
                <button
                  type="button"
                  onClick={() => setChanging(true)}
                  className="shrink-0 text-sm font-semibold text-slate-600 hover:underline"
                >
                  Change
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Google files must be shared with anyone with the link.
              </p>
              {urlValid && (
                <iframe
                  title="Help item preview"
                  src={previewSrc}
                  sandbox={helpIframeSandbox(embedType)}
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="w-full h-56 rounded-lg border border-slate-200 bg-slate-50"
                />
              )}
            </>
          )}
        </div>

        <div className="space-y-5 border-t border-slate-200 pt-5">
          <Field label="Title" htmlFor="help-item-title">
            <Input
              id="help-item-title"
              {...tourAttr('admin.help-center.form-title')}
              type="text"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Category" htmlFor="help-item-category">
              {categories.length === 0 && (
                <p className="text-sm text-amber-700">
                  No categories yet. A super admin needs to open this tab first.
                </p>
              )}
              <Select
                id="help-item-category"
                {...tourAttr('admin.help-center.form-category')}
                value={draft.categoryId}
                onChange={(e) => patch({ categoryId: e.target.value })}
                disabled={categories.length === 0}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Related widgets">
              <ChecklistSelect
                anchor={tourAttr('admin.help-center.related-widgets')}
                label="Related widgets"
                options={widgetOptions}
                selected={draft.widgetTypes}
                onToggle={(id) => toggleWidgetType(id as WidgetType)}
                emptyText="None"
                className="w-full !h-10"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="help-item-description">
            <Textarea
              id="help-item-description"
              {...tourAttr('admin.help-center.form-description')}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
            />
          </Field>
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
