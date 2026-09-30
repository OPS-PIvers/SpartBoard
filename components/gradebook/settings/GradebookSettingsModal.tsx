import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  Copy,
  Pencil,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  Btn,
  CellPopover,
} from '@/components/admin/Organization/components/primitives';
import { useBackdropDismiss } from '@/hooks/useBackdropDismiss';
import { useAuth } from '@/context/useAuth';
import {
  useGradebookSettings,
  type GradebookSettingsActions,
  type GradebookScaleOption,
} from '@/hooks/useGradebookSettings';
import { buildPlcPath, spaNavigate } from '@/utils/plcPath';
import type {
  GradebookConfigRef,
  GradebookSettingsBody,
} from '@/utils/gradebook/gradebookCore';
import {
  BUILTIN_CONFIG_ENTRY,
  applyToastText,
  cloneSettingsBody,
  defaultSettingsBody,
  duplicateName,
  type GradebookClassOption,
  type GradebookConfigEntry,
} from '@/utils/gradebook/settingsConfig';
import { GradebookSettingsEditor, SECTION } from './GradebookSettingsEditor';

export interface GradebookSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Every gradebook class, for Applies to. */
  classes: GradebookClassOption[];
  /** The class the grid is showing; the modal opens on its configuration. */
  currentClassId: string | null;
}

export interface GradebookSettingsModalViewProps extends Omit<
  GradebookSettingsModalProps,
  'isOpen'
> {
  entries: GradebookConfigEntry[];
  classRefs: ReadonlyMap<string, GradebookConfigRef | null>;
  scaleOptions: GradebookScaleOption[];
  configForClass: (rosterId: string) => GradebookConfigEntry;
  actions: GradebookSettingsActions;
}

interface UndoEntry {
  run: () => Promise<void>;
}

interface ToastState {
  id: number;
  message: string;
  canUndo: boolean;
}

const ICON_BTN =
  'h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30';
const FIELD =
  'h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30';
const ROW_LABEL = 'min-w-[130px] text-sm font-medium text-slate-600';

/** Presentational settings modal (D16); `GradebookSettingsModal` wires it to Firestore. */
export const GradebookSettingsModalView: React.FC<
  GradebookSettingsModalViewProps
> = ({
  onClose,
  classes,
  currentClassId,
  entries,
  classRefs,
  scaleOptions,
  configForClass,
  actions,
}) => {
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const toastSeq = useRef(0);
  const applyRef = useRef<HTMLButtonElement>(null);
  const backdrop = useBackdropDismiss(onClose);

  const personal = entries.filter((e) => e.source === 'personal');
  const fallback =
    (currentClassId ? configForClass(currentClassId) : null) ??
    personal[0] ??
    BUILTIN_CONFIG_ENTRY;
  const shown =
    (pickedKey ? entries.find((e) => e.key === pickedKey) : undefined) ??
    (pickedKey === BUILTIN_CONFIG_ENTRY.key ? BUILTIN_CONFIG_ENTRY : fallback);
  const ro = shown.readOnly;
  const classesOnShown = classes.filter(
    (c) => configForClass(c.id).key === shown.key
  );
  const explicitUsers = classes.filter(
    (c) => classRefs.has(c.id) && configForClass(c.id).key === shown.key
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || applyOpen || renaming) return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () =>
      window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose, applyOpen, renaming]);

  const notify = (message: string, undo?: UndoEntry) => {
    if (undo) undoStack.current = [...undoStack.current.slice(-39), undo];
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, canUndo: !!undo });
  };
  const fail = (err: unknown) => {
    console.error('[GradebookSettings]', err);
    notify('Could not save. Check your connection and try again.');
  };
  const pushUndo = (undo: UndoEntry, message: string) => notify(message, undo);

  const doUndo = () => {
    const u = undoStack.current.pop();
    setToast(null);
    if (u) void u.run().catch(fail);
  };

  const configId = (e: GradebookConfigEntry) =>
    e.ref?.source === 'personal' ? e.ref.configId : null;

  const onBodyChange = (
    next: GradebookSettingsBody,
    label: string,
    message?: string
  ) => {
    const id = configId(shown);
    if (!id) return;
    const prev = cloneSettingsBody(shown.body);
    actions.saveConfig(id, next).catch(fail);
    pushUndo(
      { run: () => actions.saveConfig(id, prev) },
      message ?? `Changed: ${label}`
    );
  };

  const createFrom = (body: GradebookSettingsBody, message: string) => {
    const id = actions.newConfigId();
    actions.createConfig(body, id).catch(fail);
    setPickedKey(`personal:${id}`);
    setRenaming(true);
    setConfirmDelete(false);
    pushUndo({ run: () => actions.deleteConfig(id) }, message);
  };

  const onDelete = () => {
    const id = configId(shown);
    if (!id) return;
    const prev = cloneSettingsBody(shown.body);
    const ref = shown.ref;
    const moved = explicitUsers.map((c) => c.id);
    setConfirmDelete(false);
    setPickedKey(
      personal.find((e) => e.key !== shown.key)?.key ?? BUILTIN_CONFIG_ENTRY.key
    );
    Promise.all(moved.map((rid) => actions.setClassConfig(rid, null)))
      .then(() => actions.deleteConfig(id))
      .catch(fail);
    pushUndo(
      {
        run: async () => {
          await actions.createConfig(prev, id);
          await Promise.all(
            moved.map((rid) => actions.setClassConfig(rid, ref))
          );
        },
      },
      `Deleted ${prev.name}`
    );
  };

  const onApply = (cls: GradebookClassOption) => {
    const previous = configForClass(cls.id);
    const checked = previous.key !== shown.key;
    const nextRef = checked ? shown.ref : null;
    actions.setClassConfig(cls.id, nextRef).catch(fail);
    pushUndo(
      { run: () => actions.setClassConfig(cls.id, previous.ref) },
      applyToastText(cls.name, shown, previous, checked)
    );
  };

  const commitRename = (raw: string) => {
    setRenaming(false);
    const name = raw.trim().slice(0, 80);
    if (!name || name === shown.name) return;
    onBodyChange(
      { ...shown.body, name },
      'Rename configuration',
      `Renamed to ${name}`
    );
  };

  const groups: { label: string; items: GradebookConfigEntry[] }[] = [
    { label: 'Personal', items: personal },
    { label: 'PLCs', items: entries.filter((e) => e.source === 'plc') },
    {
      label: 'District',
      items: entries.filter((e) => e.source === 'district'),
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-[rgba(29,42,93,0.45)] font-sans"
      {...backdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gb-settings-title"
        className="w-full max-w-[600px] max-h-[92vh] overflow-y-auto rounded-2xl bg-slate-50 shadow-xl flex flex-col gap-4 px-6 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 -mx-6 flex items-center gap-2.5 border-b border-slate-100 bg-white px-6 py-[18px]">
          <h2
            id="gb-settings-title"
            className="text-lg font-bold text-slate-900"
          >
            Gradebook settings
          </h2>
          <span className="flex-1" />
          <Btn variant="primary" size="sm" onClick={onClose}>
            Done
          </Btn>
        </header>

        <section className={`${SECTION} gap-3.5`}>
          <div className="flex items-center gap-3">
            <label htmlFor="gb-cfg" className={ROW_LABEL}>
              Configuration
            </label>
            {renaming ? (
              <input
                id="gb-cfg"
                autoFocus
                defaultValue={shown.name}
                maxLength={80}
                aria-label="Configuration name"
                className={`${FIELD} flex-1 min-w-0 max-w-[320px]`}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => commitRename(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setRenaming(false);
                  }
                }}
              />
            ) : (
              <select
                id="gb-cfg"
                value={shown.key}
                className={`${FIELD} flex-1 min-w-0 max-w-[320px]`}
                onChange={(e) => {
                  setPickedKey(e.target.value);
                  setConfirmDelete(false);
                  setApplyOpen(false);
                }}
              >
                {shown.source === 'builtin' && (
                  <option value={BUILTIN_CONFIG_ENTRY.key} disabled>
                    Default settings
                  </option>
                )}
                {groups.map((g) =>
                  g.items.length ? (
                    <optgroup key={g.label} label={g.label}>
                      {g.items.map((e) => (
                        <option key={e.key} value={e.key}>
                          {e.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                )}
              </select>
            )}
            <span className="flex gap-0.5">
              {!ro && (
                <button
                  type="button"
                  className={ICON_BTN}
                  title="Rename"
                  aria-label="Rename configuration"
                  onClick={() => setRenaming(true)}
                >
                  <Pencil size={15} aria-hidden />
                </button>
              )}
              <button
                type="button"
                className={ICON_BTN}
                title={
                  shown.source === 'plc' || shown.source === 'district'
                    ? 'Copy to my configurations'
                    : 'Duplicate'
                }
                aria-label="Duplicate configuration"
                onClick={() =>
                  createFrom(
                    {
                      ...cloneSettingsBody(shown.body),
                      name: duplicateName(shown),
                    },
                    'Duplicated configuration'
                  )
                }
              >
                <Copy size={15} aria-hidden />
              </button>
              {!ro && (
                <button
                  type="button"
                  className={`${ICON_BTN} hover:text-brand-red-primary`}
                  title="Delete"
                  aria-label="Delete configuration"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </span>
            <Btn
              size="sm"
              onClick={() =>
                createFrom(
                  defaultSettingsBody('New configuration'),
                  'Created configuration'
                )
              }
            >
              + New
            </Btn>
          </div>

          {confirmDelete && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
              <span className="flex-1">
                Delete <b>{shown.name}</b>?
                {explicitUsers.length > 0 &&
                  ` ${explicitUsers.length} class${explicitUsers.length === 1 ? ' goes' : 'es go'} back to the default settings.`}
              </span>
              <Btn variant="danger" size="sm" onClick={onDelete}>
                Delete
              </Btn>
              <Btn size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Btn>
            </div>
          )}

          {shown.source === 'builtin' ? (
            <p className="text-xs text-slate-500">
              Classes with no configuration use these defaults. Create one with
              + New to change them.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <span id="gb-applies" className={ROW_LABEL}>
                Applies to
              </span>
              <button
                ref={applyRef}
                type="button"
                aria-labelledby="gb-applies"
                aria-haspopup="menu"
                aria-expanded={applyOpen}
                onClick={() => setApplyOpen((o) => !o)}
                className={`${FIELD} flex flex-1 min-w-0 max-w-[320px] items-center gap-2 text-left`}
              >
                <span
                  className={`flex-1 truncate ${classesOnShown.length ? '' : 'text-slate-400'}`}
                >
                  {classesOnShown.length
                    ? classesOnShown.map((c) => c.name).join(', ')
                    : 'No classes'}
                </span>
                <ChevronDown
                  size={16}
                  className="shrink-0 text-slate-400"
                  aria-hidden
                />
              </button>
            </div>
          )}

          {shown.source === 'plc' && shown.ref?.source === 'plc' && (
            <p className="text-xs text-slate-500">
              Your PLC lead manages this configuration.{' '}
              <button
                type="button"
                className="font-semibold text-brand-blue-primary hover:underline"
                onClick={() => {
                  if (shown.ref?.source === 'plc')
                    spaNavigate(buildPlcPath(shown.ref.plcId, 'settings'));
                }}
              >
                Open in PLC
              </button>
            </p>
          )}
          {shown.source === 'district' && (
            <p className="text-xs text-slate-500">
              Your district manages this configuration for your building.
            </p>
          )}
        </section>

        <GradebookSettingsEditor
          body={shown.body}
          readOnly={ro}
          scaleOptions={scaleOptions}
          onChange={onBodyChange}
          onNotice={(m) => notify(m)}
        />

        <p className="text-xs text-slate-500">
          Grading periods come from your building (set by an admin).
        </p>
      </div>

      <CellPopover
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        anchorRef={applyRef}
        className="max-h-[280px] overflow-y-auto"
      >
        <div role="menu" aria-label="Applies to" className="min-w-[312px]">
          {classes.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-500">No classes</p>
          )}
          {classes.map((c) => {
            const on = configForClass(c.id).key === shown.key;
            const cur = configForClass(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onApply(c)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none ${on ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
              >
                <span className="w-4 shrink-0 text-brand-blue-primary">
                  {on && <Check size={16} aria-hidden />}
                </span>
                <span className="flex-1 truncate">{c.name}</span>
                {!on && cur.source !== 'builtin' && (
                  <span className="text-[11px] font-normal text-slate-400">
                    {cur.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CellPopover>

      {toast && (
        <div
          key={toast.id}
          role="status"
          className="fixed bottom-6 left-1/2 z-toast flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3.5 rounded-lg bg-brand-blue-dark px-4 py-2.5 text-[13px] text-white shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <span>{toast.message}</span>
          {toast.canUndo && (
            <button
              type="button"
              className="font-bold underline"
              onClick={doUndo}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>,
    document.body
  );
};

/** D16 teacher settings modal, backed by `users/{uid}/gradebook_settings` and class links. */
export const GradebookSettingsModal: React.FC<GradebookSettingsModalProps> = ({
  isOpen,
  ...rest
}) => {
  const s = useGradebookSettings(isOpen);
  if (!isOpen) return null;
  return (
    <GradebookSettingsModalView
      {...rest}
      entries={s.entries}
      classRefs={s.classRefs}
      scaleOptions={s.scaleOptions}
      configForClass={s.configForClass}
      actions={s}
    />
  );
};

/** Sub-bar gear button that owns the modal, for the grid to drop in. */
export const GradebookSettingsButton: React.FC<
  Omit<GradebookSettingsModalProps, 'isOpen' | 'onClose'> & {
    className?: string;
  }
> = ({ className = '', ...rest }) => {
  const [open, setOpen] = useState(false);
  const { canAccessFeature } = useAuth();
  if (!canAccessFeature('gradebook')) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={() => setOpen(true)}
        className={`${ICON_BTN} ${className}`}
      >
        <Settings size={18} aria-hidden />
      </button>
      <GradebookSettingsModal
        {...rest}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
};
