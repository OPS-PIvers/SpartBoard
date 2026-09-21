/**
 * ProjectEditorModal — full-screen editor for a project definition.
 *
 * Two-pane EditorWorkspace matching the Quiz and Video Activity editors: the
 * left context pane carries project details plus the sortable step list, the
 * right detail pane edits whichever step is selected. D16's one-line-per-step
 * paste survives as the list's bulk-add affordance.
 */

import React, { useMemo, useState } from 'react';
import {
  GripVertical,
  ListChecks,
  Lock,
  MousePointerClick,
  Plus,
  ScrollText,
  X,
} from 'lucide-react';
import type {
  LibraryFolder,
  ProjectDefinition,
  ProjectStep,
  Rubric,
} from '@/types';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';
import { FolderSelectField } from '@/components/common/library/FolderSelectField';
import { SortableList } from '@/components/common/SortableList';
import { Toggle } from '@/components/common/Toggle';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import { MAX_STEPS, parseStepLines } from '../projectSteps';

/** ms epoch <-> `<input type="datetime-local">` value (local time, no seconds). */
const msToLocalInputValue = (ms: number | undefined): string => {
  if (!ms) return '';
  const tzOffsetMs = new Date(ms).getTimezoneOffset() * 60_000;
  return new Date(ms - tzOffsetMs).toISOString().slice(0, 16);
};
const localInputValueToMs = (value: string): number | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
};

const labelClass =
  'block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1';
const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';

const stepsEqual = (a: ProjectStep[], b: ProjectStep[]): boolean =>
  a.length === b.length &&
  a.every((step, i) => {
    const other = b[i];
    return (
      step.id === other.id &&
      step.title === other.title &&
      (step.description ?? '') === (other.description ?? '') &&
      step.dueAt === other.dueAt &&
      Boolean(step.requiresApproval) === Boolean(other.requiresApproval)
    );
  });

interface ProjectEditorModalProps {
  isOpen: boolean;
  project: ProjectDefinition | null;
  rubrics: Rubric[];
  folders: LibraryFolder[];
  onSave: (next: ProjectDefinition) => Promise<void>;
  onClose: () => void;
}

export const ProjectEditorModal: React.FC<ProjectEditorModalProps> = ({
  isOpen,
  project,
  rubrics,
  folders,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState<ProjectDefinition | null>(project);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seed while rendering when a different project opens; an effect would
  // paint the previous project's fields first.
  const [seededId, setSeededId] = useState(project?.id);
  if (seededId !== project?.id) {
    setSeededId(project?.id);
    setDraft(project);
    setSelectedStepId(project?.steps[0]?.id ?? null);
    setBulkOpen(false);
    setBulkText('');
  }

  const isDirty = useMemo(() => {
    if (!draft || !project) return false;
    return (
      draft.title !== project.title ||
      (draft.description ?? '') !== (project.description ?? '') ||
      draft.dueAt !== project.dueAt ||
      (draft.folderId ?? null) !== (project.folderId ?? null) ||
      draft.rubric?.id !== project.rubric?.id ||
      !stepsEqual(draft.steps, project.steps)
    );
  }, [draft, project]);

  // New identity on every draft edit — the autosave quiet period restarts on it.
  const draftToken = useMemo(() => [draft], [draft]);

  const incompleteNotice = useMemo(() => {
    if (!draft) return null;
    if (!draft.title.trim()) return 'Project title is required';
    if (draft.steps.some((step) => !step.title.trim()))
      return 'Every step needs a title';
    return null;
  }, [draft]);

  if (!draft) return null;

  const patch = (updates: Partial<ProjectDefinition>): void =>
    setDraft((current) => (current ? { ...current, ...updates } : current));

  const patchStep = (stepId: string, updates: Partial<ProjectStep>): void =>
    patch({
      steps: draft.steps.map((step) =>
        step.id === stepId ? { ...step, ...updates } : step
      ),
    });

  const addStep = (): void => {
    if (draft.steps.length >= MAX_STEPS) return;
    const step: ProjectStep = { id: crypto.randomUUID(), title: '' };
    patch({ steps: [...draft.steps, step] });
    setSelectedStepId(step.id);
  };

  const deleteStep = (stepId: string): void => {
    const remaining = draft.steps.filter((step) => step.id !== stepId);
    patch({ steps: remaining });
    if (selectedStepId === stepId) {
      setSelectedStepId(remaining[0]?.id ?? null);
    }
  };

  const applyBulk = (): void => {
    // Existing steps are passed through so an unchanged line keeps its id —
    // and with it, every group's progress against that step.
    const parsed = parseStepLines(bulkText, draft.steps);
    if (parsed.length === 0) return;
    patch({ steps: parsed });
    setSelectedStepId(parsed[0]?.id ?? null);
    setBulkOpen(false);
    setBulkText('');
  };

  const selectedStep =
    draft.steps.find((step) => step.id === selectedStepId) ?? null;

  const atStepCeiling = draft.steps.length >= MAX_STEPS;

  // Persist only — the shell owns closing. Steps keep their blank titles: an
  // unnamed step is one the teacher is still writing, not one to throw away.
  const persistDraft = async (): Promise<void> => {
    if (!draft) return;
    setSaving(true);
    try {
      await onSave({
        ...draft,
        title: draft.title.trim() || 'Untitled project',
        steps: draft.steps.map((step) => ({
          ...step,
          title: step.title.trim(),
        })),
      });
    } finally {
      setSaving(false);
    }
  };

  const contextPane = (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <label className={labelClass} htmlFor="project-editor-description">
            Description
          </label>
          <textarea
            id="project-editor-description"
            rows={2}
            value={draft.description ?? ''}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="What the groups are building, in a sentence."
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="project-editor-due">
              Due
            </label>
            <input
              id="project-editor-due"
              type="datetime-local"
              value={msToLocalInputValue(draft.dueAt)}
              onChange={(e) =>
                patch({ dueAt: localInputValueToMs(e.target.value) })
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="project-editor-rubric">
              <ScrollText className="mr-1 inline h-3 w-3" aria-hidden />
              Rubric
            </label>
            <select
              id="project-editor-rubric"
              value={draft.rubric?.id ?? ''}
              onChange={(e) => {
                const picked = rubrics.find((r) => r.id === e.target.value);
                const next = { ...draft };
                if (picked) {
                  // A snapshot, not a reference: editing the library rubric
                  // later must not silently rescore work already graded.
                  next.rubric = picked;
                  next.rubricMaxPoints = rubricMaxPoints(picked);
                } else {
                  delete next.rubric;
                  delete next.rubricMaxPoints;
                }
                setDraft(next);
              }}
              className={inputClass}
            >
              <option value="">No rubric</option>
              {rubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          Steps ({draft.steps.length})
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setBulkOpen((open) => !open)}
            aria-expanded={bulkOpen}
            className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
          >
            Paste steps
          </button>
          <button
            type="button"
            onClick={addStep}
            disabled={atStepCeiling}
            title={
              atStepCeiling
                ? `A project holds up to ${MAX_STEPS} steps.`
                : undefined
            }
            className="inline-flex items-center gap-1 rounded-lg bg-brand-blue-primary px-2.5 py-1 text-xs font-bold text-white transition hover:bg-brand-blue-dark disabled:opacity-40"
          >
            <Plus className="h-3 w-3" aria-hidden />
            Add step
          </button>
        </div>
      </div>

      {bulkOpen && (
        <div className="space-y-2 border-y border-slate-200 bg-slate-50 px-4 py-3">
          <label className={labelClass} htmlFor="project-editor-bulk">
            One step per line
          </label>
          <textarea
            id="project-editor-bulk"
            rows={6}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={
              'Research the topic\nBuild an outline\nDraft the poster'
            }
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-slate-500">
            Replaces the list below. A line that matches a step you already have
            keeps that step&apos;s settings and its groups&apos; progress.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyBulk}
              disabled={bulkText.trim().length === 0}
              className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              Use these steps
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkOpen(false);
                setBulkText('');
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
        {draft.steps.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No steps yet. Add them one at a time, or paste a list.
          </p>
        ) : (
          <SortableList
            items={draft.steps}
            getId={(step) => step.id}
            onReorder={(next) => patch({ steps: next })}
            className="flex flex-col gap-1.5"
            renderItem={(step, handle, index) => (
              <div
                className={`group flex items-stretch rounded-lg border transition-colors ${
                  step.id === selectedStepId
                    ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <button
                  type="button"
                  {...handle.attributes}
                  onPointerDown={
                    handle.listeners?.onPointerDown as
                      | React.PointerEventHandler<HTMLButtonElement>
                      | undefined
                  }
                  aria-label={`Reorder ${step.title || `step ${index + 1}`}`}
                  className="cursor-grab touch-none px-1.5 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStepId(step.id)}
                  aria-current={step.id === selectedStepId ? 'true' : undefined}
                  aria-label={`Edit ${step.title || `step ${index + 1}`}`}
                  className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
                >
                  <span className="w-5 shrink-0 text-center font-mono text-xs text-slate-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {step.title || (
                      <span className="italic text-slate-400">
                        Untitled step
                      </span>
                    )}
                  </span>
                  {step.requiresApproval && (
                    <Lock
                      className="h-3.5 w-3.5 shrink-0 text-amber-600"
                      aria-label="Needs your approval"
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => deleteStep(step.id)}
                  aria-label={`Delete ${step.title || `step ${index + 1}`}`}
                  className="px-2 text-slate-300 opacity-0 transition hover:text-brand-red-primary group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );

  const detailPane = !selectedStep ? (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center text-slate-500">
      <MousePointerClick
        className="mb-3 h-10 w-10 text-slate-400"
        aria-hidden
      />
      <h4 className="mb-1 text-base font-bold text-slate-700">
        {draft.steps.length === 0 ? 'No steps yet' : 'Pick a step'}
      </h4>
      <p className="max-w-xs text-sm">
        {draft.steps.length === 0
          ? 'Add a step, or paste a whole list at once, then click it to fill in the detail.'
          : 'Click a step on the left to write its description and decide whether it needs your approval.'}
      </p>
    </div>
  ) : (
    <div className="space-y-4 px-5 py-4">
      <div>
        <label className={labelClass} htmlFor="project-step-title">
          Step title
        </label>
        <input
          id="project-step-title"
          type="text"
          value={selectedStep.title}
          onChange={(e) =>
            patchStep(selectedStep.id, { title: e.target.value })
          }
          placeholder="Research the topic"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="project-step-description">
          What this step means
        </label>
        <textarea
          id="project-step-description"
          rows={4}
          value={selectedStep.description ?? ''}
          onChange={(e) =>
            patchStep(selectedStep.id, { description: e.target.value })
          }
          placeholder="Optional — the groups read this on their project page."
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="project-step-due">
          Step due date
        </label>
        <input
          id="project-step-due"
          type="datetime-local"
          value={msToLocalInputValue(selectedStep.dueAt)}
          onChange={(e) =>
            patchStep(selectedStep.id, {
              dueAt: localInputValueToMs(e.target.value),
            })
          }
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">
          Shown to the group. It does not lock the step (A7).
        </p>
      </div>

      <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-700">
            Needs your approval
          </span>
          <span className="block text-xs text-slate-500">
            Groups stop at &ldquo;ready for review&rdquo; and only you can mark
            this step done.
          </span>
        </span>
        <Toggle
          checked={Boolean(selectedStep.requiresApproval)}
          onChange={(next) =>
            patchStep(selectedStep.id, { requiresApproval: next })
          }
          label={`${selectedStep.title || 'This step'} needs approval`}
        />
      </label>
    </div>
  );

  return (
    <EditorWorkspace
      isOpen={isOpen}
      title={draft.title}
      onTitleChange={(next) => patch({ title: next })}
      titlePlaceholder="Project title"
      headerExtras={
        <FolderSelectField
          folders={folders}
          value={draft.folderId ?? null}
          onChange={(folderId) => patch({ folderId })}
        />
      }
      subtitle={`${draft.steps.length} step${draft.steps.length === 1 ? '' : 's'}`}
      isDirty={isDirty}
      isSaving={saving}
      saveLabel="Save project"
      onSave={persistDraft}
      autosave={{ draftToken }}
      incompleteNotice={incompleteNotice}
      onClose={onClose}
      contextRatio={50}
      contextPane={contextPane}
      detailPane={detailPane}
    />
  );
};
