import React, { useRef, useState } from 'react';
import { FileUp, Link2, Loader2, Paperclip, Trash2 } from 'lucide-react';
import type { ProjectStep, ProjectUpload, ProjectWorkLink } from '@/types';
import {
  PROJECT_UPLOAD_ACCEPT,
  sortUploads,
  uploadArchiveLabel,
} from '@/components/widgets/Projects/projectUploads';
import { makeWorkLink } from '@/components/widgets/Projects/projectSteps';

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Step label for a link or file tagged to one, so "ready for review" can point at something (D19). */
const stepLabel = (steps: ProjectStep[], stepId?: string): string | null =>
  stepId ? (steps.find((s) => s.id === stepId)?.title ?? null) : null;

interface StepPickerProps {
  steps: ProjectStep[];
  value: string;
  onChange: (stepId: string) => void;
  id: string;
}

const StepPicker: React.FC<StepPickerProps> = ({
  steps,
  value,
  onChange,
  id,
}) => (
  <>
    <label className="sr-only" htmlFor={id}>
      Which step this is for
    </label>
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-xl border border-slate-200 px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
    >
      <option value="">No step</option>
      {steps.map((step) => (
        <option key={step.id} value={step.id}>
          {step.title}
        </option>
      ))}
    </select>
  </>
);

interface ProjectGroupWorkProps {
  steps: ProjectStep[];
  workLinks: ProjectWorkLink[];
  uploads: ProjectUpload[];
  uploadsLoading: boolean;
  /** False once the teacher closes the run; the lists stay readable. */
  canEdit: boolean;
  uid: string;
  onAddLink: (link: ProjectWorkLink) => Promise<void>;
  onRemoveLink: (link: ProjectWorkLink) => Promise<void>;
  onUpload: (file: File, stepId?: string) => Promise<void>;
  onRemoveUpload: (upload: ProjectUpload) => Promise<void>;
  onError: (message: string) => void;
}

export const ProjectGroupWork: React.FC<ProjectGroupWorkProps> = ({
  steps,
  workLinks,
  uploads,
  uploadsLoading,
  canEdit,
  uid,
  onAddLink,
  onRemoveLink,
  onUpload,
  onRemoveUpload,
  onError,
}) => {
  const [urlDraft, setUrlDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [linkStepId, setLinkStepId] = useState('');
  const [uploadStepId, setUploadStepId] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const submitLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (addingLink) return;
    const link = makeWorkLink(urlDraft, uid, {
      label: labelDraft,
      stepId: linkStepId || undefined,
    });
    if (!link) {
      onError('That does not look like a web address.');
      return;
    }
    setAddingLink(true);
    try {
      await onAddLink(link);
      setUrlDraft('');
      setLabelDraft('');
      setLinkStepId('');
    } catch {
      onError('That link could not be saved.');
    } finally {
      setAddingLink(false);
    }
  };

  const submitFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      await onUpload(file, uploadStepId || undefined);
      setUploadStepId('');
    } catch (uploadError) {
      onError(
        uploadError instanceof Error
          ? uploadError.message
          : 'That file could not be uploaded.'
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Link2 className="h-4 w-4 text-slate-400" strokeWidth={2.25} />
          Links
        </h3>

        {workLinks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nothing linked yet. Add the doc or slides you are working in.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {workLinks.map((link) => {
              const forStep = stepLabel(steps, link.stepId);
              // `??` would keep an empty label; a blank one should show the url.
              const linkText = link.label?.trim() ? link.label : link.url;
              return (
                <li
                  key={link.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold text-brand-blue-primary hover:underline"
                    >
                      {linkText}
                    </a>
                    {forStep && (
                      <span className="text-xs text-slate-500">{forStep}</span>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void onRemoveLink(link)}
                      aria-label={`Remove ${linkText}`}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-brand-red-primary"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <form
            onSubmit={(event) => void submitLink(event)}
            className="mt-3 space-y-2"
          >
            <label className="sr-only" htmlFor="project-link-url">
              Web address
            </label>
            <input
              id="project-link-url"
              type="text"
              inputMode="url"
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              placeholder="Paste a link"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            />
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="project-link-label">
                What this link is
              </label>
              <input
                id="project-link-label"
                type="text"
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                placeholder="What it is (optional)"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
              />
              {steps.length > 0 && (
                <StepPicker
                  id="project-link-step"
                  steps={steps}
                  value={linkStepId}
                  onChange={setLinkStepId}
                />
              )}
            </div>
            <button
              type="submit"
              disabled={addingLink || urlDraft.trim().length === 0}
              className="w-full rounded-xl bg-brand-blue-primary px-3 py-2 text-sm font-bold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {addingLink ? 'Adding…' : 'Add link'}
            </button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Paperclip className="h-4 w-4 text-slate-400" strokeWidth={2.25} />
          Files
        </h3>

        {uploadsLoading ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading files…
          </p>
        ) : uploads.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No files yet. Anything you upload goes to your teacher&apos;s Drive.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {sortUploads(uploads).map((upload) => {
              const forStep = stepLabel(steps, upload.stepId);
              return (
                <li
                  key={upload.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    {upload.driveUrl ? (
                      <a
                        href={upload.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-semibold text-brand-blue-primary hover:underline"
                      >
                        {upload.fileName}
                      </a>
                    ) : (
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {upload.fileName}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {formatSize(upload.sizeBytes)} ·{' '}
                      {uploadArchiveLabel(upload)}
                      {forStep ? ` · ${forStep}` : ''}
                    </span>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void onRemoveUpload(upload)}
                      aria-label={`Remove ${upload.fileName}`}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-brand-red-primary"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <div className="mt-3 space-y-2">
            {steps.length > 0 && (
              <StepPicker
                id="project-upload-step"
                steps={steps}
                value={uploadStepId}
                onChange={setUploadStepId}
              />
            )}
            <label className="sr-only" htmlFor="project-upload-input">
              Choose a file to upload
            </label>
            <input
              id="project-upload-input"
              ref={fileInput}
              type="file"
              accept={PROJECT_UPLOAD_ACCEPT}
              disabled={uploading}
              onChange={(event) => void submitFile(event.target.files?.[0])}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-blue-primary file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-brand-blue-dark"
            />
            {uploading && (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Uploading…
              </p>
            )}
            {!uploading && (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <FileUp className="h-3.5 w-3.5" aria-hidden />
                Up to 25 MB each.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
