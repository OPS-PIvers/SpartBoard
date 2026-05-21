import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, Plus, X, Check } from 'lucide-react';
import {
  usePlcResources,
  CreatePlcResourceInput,
} from '@/hooks/usePlcResources';
import { useDashboard } from '@/context/useDashboard';
import { PlcTargetPicker, PlcTargetPickerValue } from './PlcTargetPicker';
import { PlcResourceKind } from '@/types';

const KIND_LABELS: Record<PlcResourceKind, string> = {
  quiz: 'Quiz',
  'video-activity': 'Video Activity',
  assignment: 'Assignment',
  doc: 'Document / Link',
  board: 'Shared Board',
};

const EMPTY_FORM: CreatePlcResourceInput = {
  kind: 'doc',
  title: '',
  description: '',
  refId: '',
  scope: 'all',
  plcIds: [],
};

type FormState = CreatePlcResourceInput & { editingId?: string };

/**
 * Admin panel tab for curating and pushing resources to specific or all PLCs.
 */
export const PlcResourcesManager: React.FC = () => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const {
    resources,
    loading,
    error,
    createResource,
    updateResource,
    deleteResource,
  } = usePlcResources({ asAdmin: true });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSubmitError(null);
    setShowForm(false);
  };

  const handleEdit = (res: (typeof resources)[number]) => {
    setForm({
      kind: res.kind,
      title: res.title,
      description: res.description,
      refId: res.refId,
      scope: res.scope,
      plcIds: res.plcIds,
      editingId: res.id,
    });
    setSubmitError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setSubmitError(
        t('plcDashboard.resources.errorTitleRequired', {
          defaultValue: 'Title is required.',
        })
      );
      return;
    }
    if (!form.refId.trim()) {
      setSubmitError(
        t('plcDashboard.resources.errorRefRequired', {
          defaultValue: 'Source URL or ID is required.',
        })
      );
      return;
    }
    if (form.scope === 'selected' && form.plcIds.length === 0) {
      setSubmitError(
        t('plcDashboard.resources.errorPlcRequired', {
          defaultValue: 'Select at least one PLC when using "Selected PLCs".',
        })
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: CreatePlcResourceInput = {
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim(),
        refId: form.refId.trim(),
        scope: form.scope,
        plcIds: form.scope === 'all' ? [] : form.plcIds,
      };
      if (form.editingId) {
        await updateResource(form.editingId, payload);
      } else {
        await createResource(payload);
      }
      resetForm();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to save resource.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        t('plcDashboard.resources.confirmDelete', {
          defaultValue: 'Delete this resource? PLCs will no longer see it.',
        })
      )
    ) {
      return;
    }
    try {
      await deleteResource(id);
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.resources.deleteFailed', {
              defaultValue: "Couldn't delete that resource. Please try again.",
            }),
        'error'
      );
    }
  };

  const targetValue: PlcTargetPickerValue = {
    scope: form.scope,
    plcIds: form.plcIds,
  };

  const handleTargetChange = (v: PlcTargetPickerValue) => {
    setForm((f) => ({ ...f, scope: v.scope, plcIds: v.plcIds }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            {t('plcDashboard.resources.managerTitle', {
              defaultValue: 'PLC Resources',
            })}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {t('plcDashboard.resources.managerSubtitle', {
              defaultValue:
                'Push curated resources (docs, quizzes, boards) to specific or all PLCs.',
            })}
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('plcDashboard.resources.addResource', {
              defaultValue: 'Add Resource',
            })}
          </button>
        )}
      </div>

      {/* Create / edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm"
          aria-label={
            form.editingId
              ? t('plcDashboard.resources.editFormLabel', {
                  defaultValue: 'Edit resource',
                })
              : t('plcDashboard.resources.createFormLabel', {
                  defaultValue: 'Create resource',
                })
          }
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-slate-700 text-sm">
              {form.editingId
                ? t('plcDashboard.resources.editTitle', {
                    defaultValue: 'Edit Resource',
                  })
                : t('plcDashboard.resources.newTitle', {
                    defaultValue: 'New Resource',
                  })}
            </span>
            <button
              type="button"
              onClick={resetForm}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
              aria-label={t('plcDashboard.resources.cancelForm', {
                defaultValue: 'Cancel',
              })}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Kind */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
              {t('plcDashboard.resources.kindLabel', { defaultValue: 'Kind' })}
            </label>
            <select
              value={form.kind}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  kind: e.target.value as PlcResourceKind,
                }))
              }
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
            >
              {(Object.keys(KIND_LABELS) as PlcResourceKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
              {t('plcDashboard.resources.titleLabel', {
                defaultValue: 'Title',
              })}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder={t('plcDashboard.resources.titlePlaceholder', {
                defaultValue: 'e.g. Unit 3 Planning Doc',
              })}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
            />
          </div>

          {/* Source ref — label changes by kind */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
              {form.kind === 'doc'
                ? t('plcDashboard.resources.refUrlLabel', {
                    defaultValue: 'Google Docs URL',
                  })
                : t('plcDashboard.resources.refIdLabel', {
                    defaultValue: 'Source ID (synced group / shared board)',
                  })}
            </label>
            <input
              type={form.kind === 'doc' ? 'url' : 'text'}
              value={form.refId}
              onChange={(e) =>
                setForm((f) => ({ ...f, refId: e.target.value }))
              }
              placeholder={
                form.kind === 'doc'
                  ? 'https://docs.google.com/…'
                  : 'group-id or shareId'
              }
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
              {t('plcDashboard.resources.descriptionLabel', {
                defaultValue: 'Notes for PLC members (optional)',
              })}
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              placeholder={t('plcDashboard.resources.descriptionPlaceholder', {
                defaultValue: 'Context or instructions…',
              })}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 resize-none"
            />
          </div>

          {/* Target picker */}
          <PlcTargetPicker
            value={targetValue}
            onChange={handleTargetChange}
            disabled={submitting}
          />

          {/* Error */}
          {submitError && (
            <p className="text-sm text-red-600" role="alert">
              {submitError}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              {submitting
                ? t('plcDashboard.resources.saving', {
                    defaultValue: 'Saving…',
                  })
                : t('plcDashboard.resources.save', {
                    defaultValue: 'Save',
                  })}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="text-slate-500 hover:text-slate-700 text-sm px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              {t('plcDashboard.resources.cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>
        </form>
      )}

      {/* Existing resources list */}
      <div>
        {loading ? (
          <p className="text-sm text-slate-400 italic py-4">
            {t('plcDashboard.resources.loading', {
              defaultValue: 'Loading resources…',
            })}
          </p>
        ) : error ? (
          <p className="text-sm text-red-600 py-4" role="alert">
            {t('plcDashboard.resources.loadError', {
              defaultValue: 'Failed to load resources.',
            })}
          </p>
        ) : resources.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-4">
            {t('plcDashboard.resources.empty', {
              defaultValue: 'No resources yet. Add one above.',
            })}
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Pushed resources">
            {resources.map((res) => (
              <li
                key={res.id}
                className="flex items-start justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-brand-blue-primary bg-brand-blue-primary/10 px-2 py-0.5 rounded-full">
                      {KIND_LABELS[res.kind]}
                    </span>
                    <span className="text-xs text-slate-400">
                      {res.scope === 'all'
                        ? t('plcDashboard.resources.targetAllBadge', {
                            defaultValue: 'All PLCs',
                          })
                        : t('plcDashboard.resources.targetSelectedBadge', {
                            defaultValue: `${res.plcIds.length} PLC(s)`,
                            count: res.plcIds.length,
                          })}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800 text-sm mt-1 truncate">
                    {res.title}
                  </p>
                  {res.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {res.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(res)}
                    className="p-1.5 text-slate-400 hover:text-brand-blue-primary rounded-lg hover:bg-slate-100 transition-colors"
                    aria-label={t('plcDashboard.resources.editAction', {
                      defaultValue: `Edit ${res.title}`,
                    })}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(res.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                    aria-label={t('plcDashboard.resources.deleteAction', {
                      defaultValue: `Delete ${res.title}`,
                    })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
