/**
 * ShareWithSubModal — hand a substitute a board or a whole collection for the
 * day (docs/plans/shipped/SUB_SHARE_COLLECTIONS.md §3.2). One dialog for both, because
 * a single-board sub share is written as a one-board collection share.
 *
 * The sub sees the boards as the teacher set them up and clicks through them in
 * the teacher's order. Nested sub-collections come along, so a "Week of Oct 6"
 * collection with a folder per day arrives whole.
 *
 * If a live share already exists for this board or collection, the dialog opens
 * on updating it rather than creating a second one the sub would have to choose
 * between.
 */

import { type FC, useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Mail, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { usePresetSubEmails } from '@/hooks/usePresetSubEmails';
import { BUILDINGS, canonicalBuildingId } from '@/config/buildings';
import { logError } from '@/utils/logError';
import {
  collectShareRosterIds,
  flattenSharedCollection,
  singleBoardTree,
} from '@/utils/subShareSnapshot';
import type { SubShareBundle } from '@/utils/bundleSubShareContent';
import type {
  Collection,
  Dashboard,
  SharedCollection,
  SubstituteShareRoster,
} from '@/types';

/** What the teacher chose to hand over. */
export type SubShareTarget =
  | { kind: 'board'; dashboard: Dashboard }
  | { kind: 'collection'; collection: Collection };

interface ShareWithSubModalProps {
  isOpen: boolean;
  target: SubShareTarget | null;
  /** The teacher's live sub shares, so the dialog can offer an update. */
  existingShares: SharedCollection[];
  onClose: () => void;
  /** Called after a create or update so the caller can refresh its list. */
  onSaved?: () => void;
}

const DEFAULT_SUB_EXPIRATION_HOURS = 48;
const MAX_SUB_EXPIRATION_MS = 14 * 24 * 60 * 60 * 1000;
const ORONO_EMAIL_DOMAIN = '@orono.k12.mn.us';

function formatLocalDateTime(date: Date): string {
  // <input type="datetime-local"> needs `YYYY-MM-DDTHH:mm` in local time.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function defaultExpirationIso(): string {
  return formatLocalDateTime(
    new Date(Date.now() + DEFAULT_SUB_EXPIRATION_HOURS * 60 * 60 * 1000)
  );
}

function isValidOronoEmail(email: string): boolean {
  return /^[^\s@]+@orono\.k12\.mn\.us$/i.test(email.trim());
}

export const ShareWithSubModal: FC<ShareWithSubModalProps> = ({
  isOpen,
  target,
  existingShares,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const {
    dashboards,
    collectionsApi,
    rosters,
    activeRosterId,
    addToast,
    shareSubstituteCollection,
    updateSubstituteCollectionShare,
  } = useDashboard();
  const { selectedBuildings, hasOrg } = useAuth();
  const adminBuildings = useAdminBuildings();
  const headingId = useId();

  const teacherBuildings = useMemo(() => {
    // For a no-org user `useAdminBuildings()` returns [] on purpose, so the
    // hardcoded seed is only a placeholder while an org's list hydrates.
    const list =
      adminBuildings.length > 0 ? adminBuildings : hasOrg ? BUILDINGS : [];
    return list.map((b) => ({ id: canonicalBuildingId(b.id), name: b.name }));
  }, [adminBuildings, hasOrg]);

  const defaultBuildingId = useMemo(() => {
    const first = selectedBuildings?.[0];
    if (
      first &&
      teacherBuildings.some((b) => b.id === canonicalBuildingId(first))
    ) {
      return canonicalBuildingId(first);
    }
    return teacherBuildings[0]?.id ?? '';
  }, [selectedBuildings, teacherBuildings]);

  const sourceId =
    target?.kind === 'board' ? target.dashboard.id : target?.collection.id;

  const existing = useMemo(
    () => existingShares.find((s) => s.sourceId === sourceId),
    [existingShares, sourceId]
  );

  // The boards this share carries, in the order the sub will walk them.
  const tree = useMemo(() => {
    if (!target) return null;
    if (target.kind === 'board') return singleBoardTree(target.dashboard);
    return flattenSharedCollection(
      target.collection,
      collectionsApi.collections,
      dashboards
    );
  }, [target, collectionsApi.collections, dashboards]);

  const [buildingIdPick, setBuildingIdPick] = useState<string | null>(null);
  const buildingId =
    buildingIdPick ?? existing?.buildingId ?? defaultBuildingId;
  const [expiresAtIso, setExpiresAtIso] = useState(defaultExpirationIso);
  const [emails, setEmails] = useState<string[] | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Widgets whose content could not be collected, named for the teacher.
  const [missed, setMissed] = useState<{ id: string; label: string }[]>([]);

  const takeBundle = useCallback((bundle: SubShareBundle) => {
    setMissed(
      bundle.failures.map((f) => ({
        id: `${f.kind}-${f.itemId}`,
        label: f.label,
      }))
    );
  }, []);

  const { emails: presetEmails, loading: presetsLoading } =
    usePresetSubEmails(buildingId);

  // Everything the dialog asks for belongs to the board or collection it was
  // opened on, so the fields re-seed whenever that changes — otherwise the
  // next board opens on the last one's success screen and its expiry. Done
  // while rendering rather than in an effect (CLAUDE.md), and not keyed on the
  // live share, so the refresh that follows a save leaves the link on screen.
  // Waits for the presets so the building's sub accounts still start ticked
  // (D10) when they arrive after the first render.
  const seedKey = `${sourceId ?? ''}|${buildingId}`;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (isOpen && buildingId && !presetsLoading && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setEmails(
      existing?.subEmails ?? presetEmails.filter((e) => isValidOronoEmail(e))
    );
    setExpiresAtIso(
      existing?.expiresAt
        ? formatLocalDateTime(new Date(existing.expiresAt))
        : defaultExpirationIso()
    );
    setEmailDraft('');
    setEmailError(null);
    setCreatedUrl(null);
    setCopied(false);
    setMissed([]);
  }
  const selectedEmails = useMemo(() => emails ?? [], [emails]);

  const addEmail = useCallback(() => {
    const trimmed = emailDraft.trim();
    if (!trimmed) return;
    if (!isValidOronoEmail(trimmed)) {
      setEmailError(
        t('shareLinkCreatorModal.substitute.invalidEmail', {
          defaultValue: `Must end with ${ORONO_EMAIL_DOMAIN}`,
        })
      );
      return;
    }
    const normalized = trimmed.toLowerCase();
    setEmails((prev) =>
      (prev ?? []).includes(normalized)
        ? (prev ?? [])
        : [...(prev ?? []), normalized]
    );
    setEmailDraft('');
    setEmailError(null);
  }, [emailDraft, t]);

  const toggleEmail = useCallback((email: string) => {
    setEmails((prev) =>
      (prev ?? []).includes(email)
        ? (prev ?? []).filter((e) => e !== email)
        : [...(prev ?? []), email]
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!target || !tree) return;
    if (!buildingId) {
      addToast(
        t('shareWithSub.buildingRequired', {
          defaultValue: 'Pick the building your sub signs in at.',
        }),
        'error'
      );
      return;
    }
    if (tree.orderedBoards.length === 0) {
      addToast(
        t('shareWithSub.noBoards', {
          defaultValue: 'There are no boards in this collection to share.',
        }),
        'error'
      );
      return;
    }
    const expiresAt = new Date(expiresAtIso).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      addToast(
        t('shareWithSub.expiryPast', {
          defaultValue: 'Pick an end time in the future.',
        }),
        'error'
      );
      return;
    }
    if (expiresAt > Date.now() + MAX_SUB_EXPIRATION_MS) {
      addToast(
        t('shareWithSub.expiryTooFar', {
          defaultValue: 'A sub share can run for at most 14 days.',
        }),
        'error'
      );
      return;
    }

    // Every roster the shared boards read, so the sub's class lists match the
    // teacher's. Only rosters with a Drive file can be granted.
    const rosterIds = collectShareRosterIds(tree.orderedBoards, activeRosterId);
    const sharedRosters: SubstituteShareRoster[] = rosters
      .filter((r) => rosterIds.includes(r.id) && r.driveFileId)
      .map((r) => ({
        id: r.id,
        name: r.name,
        driveFileId: r.driveFileId as string,
      }));

    const collection: Collection =
      target.kind === 'collection'
        ? target.collection
        : {
            id: target.dashboard.id,
            name: target.dashboard.name,
            parentCollectionId: null,
            order: 0,
            createdAt: target.dashboard.createdAt,
          };
    const defaultBoardId =
      target.kind === 'collection'
        ? (target.collection.defaultBoardId ?? tree.boards[0]?.id)
        : target.dashboard.id;

    setBusy(true);
    setMissed([]);
    try {
      let shareId: string;
      if (existing) {
        shareId = existing.shareId;
        await updateSubstituteCollectionShare({
          shareId,
          onBundle: takeBundle,
          collection,
          boards: tree.orderedBoards,
          kind: target.kind,
          sections: tree.sections,
          boardEntries: tree.boards,
          ...(defaultBoardId !== undefined && { defaultBoardId }),
          expiresAt,
          // Always stated on an update, so taking every sub off the share
          // reaches Firestore instead of reading as "unchanged".
          subEmails: selectedEmails,
          sharedRosters,
        });
      } else {
        shareId = await shareSubstituteCollection({
          collection,
          onBundle: takeBundle,
          boards: tree.orderedBoards,
          collectionId: collection.id,
          sourceId: collection.id,
          kind: target.kind,
          sections: tree.sections,
          boardEntries: tree.boards,
          ...(defaultBoardId !== undefined && { defaultBoardId }),
          expiresAt,
          buildingId,
          ...(selectedEmails.length > 0 ? { subEmails: selectedEmails } : {}),
          ...(sharedRosters.length > 0 ? { sharedRosters } : {}),
        });
      }
      const url = `${window.location.origin}/subs/s/${shareId}`;
      setCreatedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch (err) {
        logError('ShareWithSubModal.clipboard', err);
      }
      onSaved?.();
    } catch (err) {
      logError('ShareWithSubModal.save', err, {
        kind: target.kind,
        sourceId,
        boardCount: tree.orderedBoards.length,
        updating: Boolean(existing),
      });
      addToast(
        err instanceof Error
          ? err.message
          : t('shareWithSub.failed', {
              defaultValue: 'Could not share with your sub. Try again.',
            }),
        'error'
      );
    } finally {
      setBusy(false);
    }
  }, [
    target,
    tree,
    buildingId,
    expiresAtIso,
    selectedEmails,
    rosters,
    activeRosterId,
    existing,
    sourceId,
    shareSubstituteCollection,
    updateSubstituteCollectionShare,
    takeBundle,
    addToast,
    onSaved,
    t,
  ]);

  if (!isOpen || !target || !tree) return null;

  const targetName =
    target.kind === 'board' ? target.dashboard.name : target.collection.name;
  const sectionCount = tree.sections.length;

  const title = `${
    existing
      ? t('shareWithSub.updateTitle', {
          defaultValue: 'Update what your sub sees',
        })
      : t('shareWithSub.title', { defaultValue: 'Share with a sub' })
  }: ${targetName}`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      contentClassName="px-6 py-5"
    >
      {!createdUrl && (
        <div className="space-y-4">
          {target.kind !== 'board' && (
            <p className="text-sm text-slate-600">
              {t('shareWithSub.collectionSummary', {
                boards: tree.boards.length,
                sections: sectionCount,
                defaultValue: '{{boards}} boards in {{sections}} groups.',
              })}
            </p>
          )}
          {existing && (
            <p className="rounded-lg bg-brand-blue-lighter/30 px-3 py-2 text-xs text-slate-700">
              {t('shareWithSub.updatingHint', {
                defaultValue:
                  'Saving updates what your sub sees. The link stays the same.',
              })}
            </p>
          )}

          <div className="space-y-1">
            <label
              htmlFor={`${headingId}-building`}
              className="block text-xs font-bold text-slate-500 uppercase tracking-wider"
            >
              {t('shareWithSub.building', { defaultValue: 'Building' })}
            </label>
            <select
              id={`${headingId}-building`}
              value={buildingId}
              disabled={Boolean(existing)}
              onChange={(e) => setBuildingIdPick(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-white disabled:bg-slate-100"
            >
              {teacherBuildings.length === 0 && (
                <option value="">
                  {t('shareWithSub.noBuildings', {
                    defaultValue: 'No buildings available',
                  })}
                </option>
              )}
              {teacherBuildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor={`${headingId}-expires`}
              className="block text-xs font-bold text-slate-500 uppercase tracking-wider"
            >
              {t('shareWithSub.endsAt', { defaultValue: 'Ends' })}
            </label>
            <input
              id={`${headingId}-expires`}
              type="datetime-local"
              value={expiresAtIso}
              onChange={(e) => setExpiresAtIso(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-white"
            />
            <p className="text-[10px] text-slate-500">
              {t('shareWithSub.endsAtHint', {
                defaultValue: 'Up to 14 days.',
              })}
            </p>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              {t('shareWithSub.subs', { defaultValue: 'Who is covering' })}
            </span>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              {t('shareWithSub.subsHint', {
                defaultValue:
                  'Listed subs get your class lists until the share ends. Others in the building see the boards without names.',
              })}
            </p>
            {presetEmails.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {presetEmails
                  .filter((email) => isValidOronoEmail(email))
                  .map((email) => {
                    const on = selectedEmails.includes(email);
                    return (
                      <button
                        key={email}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleEmail(email)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                          on
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {on ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                        {email}
                      </button>
                    );
                  })}
              </div>
            )}
            {selectedEmails.filter((e) => !presetEmails.includes(e)).length >
              0 && (
              <ul className="space-y-1">
                {selectedEmails
                  .filter((e) => !presetEmails.includes(e))
                  .map((email) => (
                    <li
                      key={email}
                      className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-2 py-1 text-xs text-slate-700"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate flex-1">{email}</span>
                      <button
                        type="button"
                        onClick={() => toggleEmail(email)}
                        aria-label={t(
                          'shareLinkCreatorModal.substitute.removeEmail',
                          { defaultValue: 'Remove email' }
                        )}
                        className="shrink-0 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <div className="flex gap-1">
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => {
                  setEmailDraft(e.target.value);
                  setEmailError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                placeholder={`name${ORONO_EMAIL_DOMAIN}`}
                aria-label={t('shareLinkCreatorModal.substitute.addEmail', {
                  defaultValue: 'Add',
                })}
                className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
              />
              <button
                type="button"
                onClick={addEmail}
                className="shrink-0 inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('shareLinkCreatorModal.substitute.addEmail', {
                  defaultValue: 'Add',
                })}
              </button>
            </div>
            {emailError && (
              <p className="text-[10px] text-red-600">{emailError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {busy
                ? t('shareWithSub.saving', { defaultValue: 'Saving…' })
                : existing
                  ? t('shareWithSub.update', {
                      defaultValue: 'Update the share',
                    })
                  : t('shareWithSub.create', { defaultValue: 'Share' })}
            </button>
          </div>
        </div>
      )}

      {createdUrl && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {copied
              ? t('shareWithSub.linkCopied', {
                  defaultValue:
                    'Link copied. Your sub signs in with their school account and lands on this straight away.',
                })
              : t('shareWithSub.linkReady', {
                  defaultValue:
                    'Send this link to your sub — they sign in with their school account and land on this straight away.',
                })}
          </p>
          {missed.length > 0 && (
            <div className="p-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded">
              <p className="font-bold">
                {t('shareWithSub.missedTitle', {
                  defaultValue: 'Some widget content did not come along',
                })}
              </p>
              <ul className="mt-1 ml-4 list-disc">
                {missed.map((f) => (
                  <li key={f.id}>{f.label}</li>
                ))}
              </ul>
              <p className="mt-1">
                {t('shareWithSub.missedHelp', {
                  defaultValue:
                    'Your sub will see these empty. Open the board, check the widget loads, then push your changes again.',
                })}
              </p>
            </div>
          )}
          <div className="flex gap-1">
            <input
              type="text"
              readOnly
              value={createdUrl}
              aria-label={t('shareWithSub.urlLabel', {
                defaultValue: 'Sub share link',
              })}
              className="flex-1 px-2 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded select-all"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(createdUrl);
                    setCopied(true);
                  } catch (err) {
                    logError('ShareWithSubModal.manualCopy', err);
                  }
                })();
              }}
              className="px-2 py-1.5 text-xs font-bold bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
            >
              {t('shareCollection.copy', { defaultValue: 'Copy' })}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark"
            >
              {t('common.done', { defaultValue: 'Done' })}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
