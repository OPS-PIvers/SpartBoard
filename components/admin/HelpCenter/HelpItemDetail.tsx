import React, { lazy, Suspense, useState } from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import {
  Btn,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/admin/Organization/components/primitives';
import { ChecklistSelect } from '@/components/gradebook/settings/ChecklistSelect';
import { TOOLS } from '@/config/tools';
import type { GuidedLearningSet, InternalToolType, WidgetType } from '@/types';
import {
  HELP_PUBLISH_REFUSAL_TEXT,
  UNFILED_CATEGORY_ID,
  type HelpCategory,
  type HelpPublishRefusal,
  type HelpResourceItem,
} from '@/types/helpCenter';
import { tourStepsOf } from '@/components/tours/tourSession';
import type { HelpRowInfo } from './HelpItemList';
import { KIND_LABEL, type HelpItemFieldPatch } from './helpCenterAdmin';

const TourHealthPanel = lazy(() => import('./TourHealthPanel'));

const INTERNAL_TOOL_TYPES: ReadonlySet<InternalToolType> = new Set([
  'record',
  'magic',
  'remote',
]);

const isWidgetTool = (
  tool: (typeof TOOLS)[number]
): tool is (typeof TOOLS)[number] & { type: WidgetType } =>
  !INTERNAL_TOOL_TYPES.has(tool.type as InternalToolType);

const WIDGET_OPTIONS = TOOLS.filter(isWidgetTool).map((tool) => ({
  id: tool.type,
  label: tool.label,
}));

export interface ScopeOption {
  /** '' is Everyone. */
  id: string;
  label: string;
}

interface HelpItemDetailProps {
  item: HelpResourceItem;
  info: HelpRowInfo;
  /** Undefined while loading, null when the guide is gone. */
  set: GuidedLearningSet | null | undefined;
  /** Undefined while the set loads. */
  refusal: HelpPublishRefusal | null | undefined;
  categories: HelpCategory[];
  canWrite: boolean;
  scopeLabel: string;
  /** Present when the viewer may move the item between scopes (super admins). */
  scopeOptions: ScopeOption[] | null;
  onBack: () => void;
  onPatch: (patch: HelpItemFieldPatch) => Promise<void>;
  onScopeChange: (orgId: string | null) => Promise<void>;
  onEdit: () => void;
  onViewSteps: () => void;
  onCopyToLibrary: () => Promise<void>;
  onPublish: () => Promise<void>;
  onHide: () => Promise<void>;
  onDelete: () => Promise<void>;
}

/** The selected Help Center item: fields edited in place, its numbers and health, then its actions (H17). */
export const HelpItemDetail: React.FC<HelpItemDetailProps> = ({
  item,
  info,
  set,
  refusal,
  categories,
  canWrite,
  scopeLabel,
  scopeOptions,
  onBack,
  onPatch,
  onScopeChange,
  onEdit,
  onViewSteps,
  onCopyToLibrary,
  onPublish,
  onHide,
  onDelete,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isTour = info.kind === 'live-tour';

  const run = async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const stepCount =
    set === undefined
      ? null
      : set === null
        ? 0
        : isTour
          ? tourStepsOf(set).length
          : set.steps.length;

  const spinner = (name: string) =>
    busy === name ? (
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
    ) : undefined;

  const publishControl = info.published ? (
    <Btn
      size="lg"
      className="h-11!"
      disabled={busy !== null}
      onClick={() => void run('toggle', onHide)}
      {...tourFieldAttr('admin.help-center.item-toggle', 'help', item.id)}
      icon={spinner('toggle')}
    >
      Hide
    </Btn>
  ) : refusal ? (
    <p
      className="flex min-h-11 items-center text-sm text-amber-800"
      {...tourFieldAttr('admin.help-center.item-toggle', 'help', item.id)}
    >
      {HELP_PUBLISH_REFUSAL_TEXT[refusal]}
    </p>
  ) : (
    <Btn
      variant="primary"
      size="lg"
      className="h-11!"
      disabled={busy !== null || refusal === undefined}
      onClick={() => void run('toggle', onPublish)}
      {...tourFieldAttr('admin.help-center.item-toggle', 'help', item.id)}
      icon={spinner('toggle')}
    >
      Publish
    </Btn>
  );

  return (
    <article aria-label={item.title} className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        {...tourAttr('admin.help-center.detail-back')}
        className="flex h-11 items-center gap-1 text-sm font-semibold text-slate-600 md:hidden"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back
      </button>

      {canWrite ? (
        <div className="space-y-3">
          <Input
            key={`title-${item.id}-${item.title}`}
            aria-label="Title"
            defaultValue={item.title}
            maxLength={200}
            {...tourAttr('admin.help-center.detail-title')}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (!title) {
                e.target.value = item.title;
                return;
              }
              if (title !== item.title)
                void run('title', () => onPatch({ title }));
            }}
            className="h-11! text-base! font-semibold"
          />
          <Textarea
            key={`description-${item.id}-${item.description}`}
            aria-label="Description"
            placeholder="Description"
            defaultValue={item.description}
            maxLength={1000}
            rows={2}
            {...tourAttr('admin.help-center.detail-description')}
            onBlur={(e) => {
              const description = e.target.value.trim();
              if (description !== item.description)
                void run('description', () => onPatch({ description }));
            }}
          />
        </div>
      ) : (
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {item.title}
          </h3>
          {item.description && (
            <p className="text-sm text-slate-600">{item.description}</p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Kind
          </dt>
          <dd className="text-slate-800">{KIND_LABEL[info.kind]}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </dt>
          <dd className="text-slate-800">
            {info.published ? 'Published' : 'Hidden'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Steps
          </dt>
          <dd className="text-slate-800">{stepCount ?? '...'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Opens
          </dt>
          <dd className="text-slate-800">{item.openCount}</dd>
        </div>
        {!canWrite && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Scope
            </dt>
            <dd className="text-slate-800">{scopeLabel}</dd>
          </div>
        )}
      </dl>

      {canWrite && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="help-detail-category">
            <Select
              id="help-detail-category"
              value={item.categoryId}
              disabled={busy !== null}
              {...tourAttr('admin.help-center.detail-category')}
              onChange={(e) =>
                void run('category', () =>
                  onPatch({ categoryId: e.target.value })
                )
              }
              className="h-11!"
            >
              <option value={UNFILED_CATEGORY_ID}>Unfiled</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Widgets">
            <ChecklistSelect
              anchor={tourAttr('admin.help-center.related-widgets')}
              label="Widgets"
              options={WIDGET_OPTIONS}
              selected={item.widgetTypes}
              onToggle={(id, checked) => {
                const type = id as WidgetType;
                const widgetTypes = checked
                  ? [...item.widgetTypes.filter((t) => t !== type), type]
                  : item.widgetTypes.filter((t) => t !== type);
                void run('widgets', () => onPatch({ widgetTypes }));
              }}
              emptyText="None"
              className="w-full h-11!"
            />
          </Field>
          <Field label="Scope" htmlFor="help-detail-scope">
            {scopeOptions ? (
              <Select
                id="help-detail-scope"
                value={item.orgId ?? ''}
                disabled={busy !== null}
                {...tourAttr('admin.help-center.detail-scope')}
                onChange={(e) =>
                  void run('scope', () => onScopeChange(e.target.value || null))
                }
                className="h-11!"
              >
                {scopeOptions.map((option) => (
                  <option key={option.id || 'everyone'} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="flex h-11 items-center text-sm text-slate-800">
                {scopeLabel}
              </p>
            )}
          </Field>
        </div>
      )}

      {isTour && item.setId && (
        <Suspense
          fallback={
            <Loader2
              className="w-4 h-4 animate-spin text-slate-500"
              aria-hidden="true"
            />
          }
        >
          <TourHealthPanel setId={item.setId} />
        </Suspense>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {canWrite && (
          <Btn
            size="lg"
            className="h-11!"
            disabled={!set || busy !== null}
            onClick={onEdit}
            {...tourFieldAttr('admin.help-center.item-edit', 'help', item.id)}
          >
            Edit
          </Btn>
        )}
        {isTour ? (
          <Btn
            size="lg"
            className="h-11!"
            disabled={!set}
            onClick={onViewSteps}
            {...tourAttr('admin.help-center.view-steps')}
          >
            View steps
          </Btn>
        ) : (
          <Btn
            size="lg"
            className="h-11!"
            disabled={!set || busy !== null}
            onClick={() => void run('copy', onCopyToLibrary)}
            {...tourAttr('admin.help-center.copy-to-library')}
            icon={spinner('copy')}
          >
            Copy to my library
          </Btn>
        )}
        {canWrite && publishControl}
        {canWrite && (
          <Btn
            variant="ghost"
            size="lg"
            disabled={busy !== null}
            onClick={() => void run('delete', onDelete)}
            {...tourFieldAttr('admin.help-center.item-delete', 'help', item.id)}
            icon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
            className="ml-auto h-11! text-red-700"
          >
            Delete
          </Btn>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </article>
  );
};
