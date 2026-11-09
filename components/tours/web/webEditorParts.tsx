import React, { useState } from 'react';
import { ImageOff, Wrench } from 'lucide-react';
import type {
  GuidedLearningSet,
  WebTourLocator,
  WebTourSuggestion,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { logError } from '@/utils/logError';
import { primaryBtn, secondaryBtn } from '@/components/common/lightChrome';
import {
  redactImage,
  type RedactRect,
} from '@/components/widgets/GuidedLearning/utils/redactImage';
import { isHardHit } from './studentData';
import { BlobImage, BlurBoxes } from './BlurBoxes';
import type { HiddenText, ReviewEntry, ReviewField } from './webStepReview';
import { usePictureBlob } from './webPictures';
import {
  NEEDS_NEWER_EXTENSION,
  fieldLabel,
  type WebStep,
} from './webEditorModel';

export const WebStepPicture: React.FC<{
  path: string | undefined;
  label: string;
  className: string;
}> = ({ path, label, className }) => {
  const { blob, failed } = usePictureBlob(path);
  if (!path || failed)
    return (
      <div
        className={`${className} flex items-center justify-center bg-slate-100 text-slate-400`}
        role="img"
        aria-label={failed ? "Picture couldn't load." : 'No picture'}
      >
        <ImageOff className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  return blob ? (
    <BlobImage
      blob={blob}
      alt={label}
      className={`${className} object-contain`}
    />
  ) : (
    <div className={`${className} animate-pulse bg-slate-100`} />
  );
};

export const Highlighted: React.FC<{ entry: ReviewEntry }> = ({ entry }) => {
  const parts: React.ReactNode[] = [];
  let at = 0;
  entry.hits.forEach((hit, i) => {
    parts.push(entry.value.slice(at, hit.start));
    parts.push(
      <mark
        key={i}
        className={isHardHit(hit) ? 'bg-red-100 text-red-900' : 'bg-amber-100'}
      >
        {entry.value.slice(hit.start, hit.end)}
      </mark>
    );
    at = hit.end;
  });
  parts.push(entry.value.slice(at));
  return <span className="break-all">{parts}</span>;
};

/** Draws blur boxes over the picture on the stage, then saves the blurred copy. */
export const BlurEditor: React.FC<{
  path: string;
  index: number;
  onApply: (blob: Blob) => Promise<void>;
  onCancel: () => void;
}> = ({ path, index, onApply, onCancel }) => {
  const { blob } = usePictureBlob(path);
  const [boxes, setBoxes] = useState<RedactRect[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const apply = async () => {
    if (!blob || boxes.length === 0) return;
    setBusy(true);
    setFailed(false);
    try {
      await onApply(await redactImage(blob, boxes, { mode: 'blur' }));
    } catch (err) {
      logError('web tour blur', err, { path });
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <div
      data-testid="web-stage-blur"
      className="flex w-full max-w-5xl flex-col gap-3"
    >
      {blob ? (
        <BlurBoxes
          picture={blob}
          boxes={boxes}
          onChange={setBoxes}
          label={`Picture for step ${index + 1}. Drag across what to blur.`}
        />
      ) : (
        <div className="h-72 animate-pulse rounded-lg bg-white/10" />
      )}
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-lg">
        <span className="flex-1 text-sm text-slate-700">
          Drag across anything private. Press a box to remove it.
        </span>
        {failed && (
          <span role="alert" className="text-sm text-red-700">
            The blur couldn&apos;t be saved.
          </span>
        )}
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button type="button" className={secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          className={`${primaryBtn} disabled:opacity-50`}
          disabled={busy || boxes.length === 0}
          onClick={() => void apply()}
        >
          {busy ? 'Blurring...' : 'Apply blur'}
        </button>
      </div>
    </div>
  );
};

type ClueRow = [field: ReviewField, value: (l: WebTourLocator) => string];

const FIX_ROWS: ClueRow[] = [
  ['role', (l) => l.role ?? ''],
  ['name', (l) => l.name ?? ''],
  ['pageText', (l) => l.text ?? ''],
  ['heading', (l) => l.heading ?? ''],
  ['attr:testId', (l) => l.attrs?.testId ?? ''],
  ['attr:ariaLabel', (l) => l.attrs?.ariaLabel ?? ''],
  ['attr:name', (l) => l.attrs?.name ?? ''],
  ['attr:href', (l) => l.attrs?.href ?? ''],
  ['css', (l) => l.css ?? ''],
];

/** A fix a run found (C14): the step's clues now and the candidate's, to accept, dismiss or redo on the site. */
export const SuggestedFix: React.FC<{
  before: WebTourLocator;
  fix: WebTourSuggestion;
  canFix: boolean;
  onUse: () => void;
  onDismiss: () => void;
  onFix: () => void;
}> = ({ before, fix, canFix, onUse, onDismiss, onFix }) => {
  const rows = FIX_ROWS.map(([field, read]) => ({
    field,
    was: read(before),
    now: read(fix.locator),
  })).filter((r) => r.was || r.now);
  return (
    <section
      aria-label="Suggested fix"
      className="flex flex-col gap-2 rounded-lg bg-sky-50 px-2.5 py-2"
    >
      <div className="flex items-center gap-1.5">
        <Wrench className="h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
        <h4 className="flex-1 text-xs font-semibold text-slate-900">
          Suggested fix
        </h4>
      </div>
      <table className="w-full table-fixed text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="w-24 py-1 font-semibold">
              <span className="sr-only">Clue</span>
            </th>
            <th className="py-1 font-semibold">Before</th>
            <th className="py-1 font-semibold">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field} className="border-t border-sky-100 align-top">
              <th scope="row" className="py-1 pr-2 font-normal text-slate-500">
                {fieldLabel(r.field)}
              </th>
              <td className="break-all py-1 pr-2 text-slate-700">{r.was}</td>
              <td
                className={`break-all py-1 ${
                  r.was === r.now
                    ? 'text-slate-700'
                    : 'font-semibold text-slate-900'
                }`}
              >
                {r.now}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-1">
        {/* no-tour-anchor: shows only on a step a run found a fix for */}
        <button type="button" className={primaryBtn} onClick={onUse}>
          Use this fix
        </button>
        {/* no-tour-anchor: shows only on a step a run found a fix for */}
        <button type="button" className={secondaryBtn} onClick={onDismiss}>
          Dismiss
        </button>
        {/* no-tour-anchor: shows only on a step a run found a fix for */}
        <button
          type="button"
          className={`${secondaryBtn} disabled:cursor-not-allowed disabled:opacity-50`}
          disabled={!canFix}
          title={canFix ? undefined : NEEDS_NEWER_EXTENSION}
          onClick={onFix}
        >
          Fix on site
        </button>
      </div>
    </section>
  );
};

const hiddenWhere = (h: HiddenText) =>
  h.step === null ? 'Title' : `Step ${h.step + 1}, ${fieldLabel(h.field)}`;

/** The one check before publishing: what the text scan hid, and every picture. */
export const PublishCheck: React.FC<{
  set: GuidedLearningSet;
  hidden: HiddenText[];
  askPictures: boolean;
  onPublish: () => void;
  onBlur: () => void;
  onCancel: () => void;
}> = ({ set, hidden, askPictures, onPublish, onBlur, onCancel }) => {
  const pictured = (set.steps as WebStep[]).flatMap((s, i) =>
    s.web?.picture ? [{ path: s.web.picture.path, index: i }] : []
  );
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Before you publish"
      maxWidth="max-w-3xl"
      zIndex="z-modal-deep"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {askPictures && (
            // no-tour-anchor: inside the one-off publish check
            <button type="button" className={secondaryBtn} onClick={onBlur}>
              Blur
            </button>
          )}
          {/* no-tour-anchor: inside the one-off publish check */}
          <button type="button" className={primaryBtn} onClick={onPublish}>
            Publish
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {hidden.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Student data hidden
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              {hidden.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-40 shrink-0 text-slate-500">
                    {hiddenWhere(h)}
                  </span>
                  <span className="min-w-0 break-all text-slate-800">
                    {h.after}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {askPictures && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Anything private in these pictures?
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pictured.map((p) => (
                <WebStepPicture
                  key={p.path}
                  path={p.path}
                  label={`Picture for step ${p.index + 1}`}
                  className="h-32 w-48 shrink-0 rounded-lg border border-slate-200"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
};
