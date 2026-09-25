/**
 * ShareCollectionLinkCreatorModal — hand a colleague a copy of a Collection,
 * or, for teachers without `sub-share-collections`, hand it to a sub. Those
 * with the flag get `ShareWithSubModal` for subs instead.
 */

import { type FC, useState, useId, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Folder,
  Copy,
  UserCheck,
  Mail,
  Plus,
  Check,
  Trash2,
} from 'lucide-react';
import type { Collection, Dashboard, SubstituteShareRoster } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { usePresetSubEmails } from '@/hooks/usePresetSubEmails';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { BUILDINGS, canonicalBuildingId } from '@/config/buildings';
import { logError } from '@/utils/logError';
import {
  collectShareRosterIds,
  flattenSharedCollection,
} from '@/utils/subShareSnapshot';

interface ShareCollectionLinkCreatorModalProps {
  isOpen: boolean;
  collection: Collection | null;
  /** Boards currently in the Collection. Frozen at modal open. */
  boards: Dashboard[];
  onClose: () => void;
}

type ModeChoice = 'copy' | 'substitute';
type CopyState = 'unknown' | 'copied' | 'failed';

const ORONO_EMAIL_DOMAIN = '@orono.k12.mn.us';

function isValidOronoEmail(email: string): boolean {
  return /^[^\s@]+@orono\.k12\.mn\.us$/i.test(email.trim());
}

const SUB_TTL_PRESETS: { label: string; ms: number }[] = [
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 },
];

export const ShareCollectionLinkCreatorModal: FC<
  ShareCollectionLinkCreatorModalProps
> = ({ isOpen, collection, boards, onClose }) => {
  const { t } = useTranslation();
  const {
    shareCollection,
    shareSubstituteCollection,
    addToast,
    rosters,
    activeRosterId,
    collectionsApi,
    dashboards,
  } = useDashboard();
  const { canAccessFeature, hasOrg } = useAuth();
  const adminBuildings = useAdminBuildings();
  // Same list as ShareWithSubModal: the seed only while an org's list loads.
  const teacherBuildings = useMemo(
    () =>
      (adminBuildings.length > 0
        ? adminBuildings
        : hasOrg
          ? BUILDINGS
          : []
      ).map((b) => ({ id: canonicalBuildingId(b.id), name: b.name })),
    [adminBuildings, hasOrg]
  );
  const offerSubstitute = !canAccessFeature('sub-share-collections');
  // A sub share carries nested sub-collections too, so its count can exceed `boards`.
  const subTree = useMemo(
    () =>
      offerSubstitute && collection
        ? flattenSharedCollection(
            collection,
            collectionsApi.collections,
            dashboards
          )
        : null,
    [offerSubstitute, collection, collectionsApi.collections, dashboards]
  );
  const [mode, setMode] = useState<ModeChoice>('copy');
  const [ttlMs, setTtlMs] = useState<number>(SUB_TTL_PRESETS[1].ms);
  const [buildingId, setBuildingId] = useState<string>('');
  const [subEmails, setSubEmails] = useState<string[]>([]);
  const [subEmailDraft, setSubEmailDraft] = useState('');
  const [subEmailError, setSubEmailError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('unknown');
  const [busy, setBusy] = useState(false);
  // Widgets whose content could not be collected for the sub.
  const [missed, setMissed] = useState<{ id: string; label: string }[]>([]);
  const headingId = useId();
  const buildingSelectId = useId();

  const { emails: presetEmails } = usePresetSubEmails(buildingId);

  const handleAddSubEmail = useCallback(() => {
    const trimmed = subEmailDraft.trim();
    if (!trimmed) return;
    if (!isValidOronoEmail(trimmed)) {
      setSubEmailError(
        t('shareLinkCreatorModal.substitute.invalidEmail', {
          defaultValue: `Must end with ${ORONO_EMAIL_DOMAIN}`,
        })
      );
      return;
    }
    // Normalize before dedup/store — Firestore and .includes() are case-sensitive.
    const normalized = trimmed.toLowerCase();
    setSubEmails((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized]
    );
    setSubEmailDraft('');
    setSubEmailError(null);
  }, [subEmailDraft, t]);

  const handleCreate = useCallback(async () => {
    if (!collection) return;
    const asSub = offerSubstitute && mode === 'substitute';
    // Validate substitute prerequisites BEFORE flipping busy so an early
    // return doesn't paint the modal as "creating share".
    if (asSub) {
      if (!teacherBuildings.some((b) => b.id === buildingId)) {
        addToast(
          t('shareCollection.buildingRequired', {
            defaultValue: 'Select a building before sharing with a sub.',
          }),
          'error'
        );
        return;
      }
      const invalidEmail = subEmails.find((e) => !isValidOronoEmail(e));
      if (invalidEmail) {
        addToast(
          t('shareLinkCreatorModal.substitute.invalidEmail', {
            defaultValue: `Must end with ${ORONO_EMAIL_DOMAIN}`,
          }),
          'error'
        );
        return;
      }
    }
    setBusy(true);
    // try/finally guarantees `setBusy(false)` runs even if a future
    // refactor adds an early `return` after a throw or an unawaited
    // sub-action raises — without it, the modal would lock into a
    // permanently "Creating…" state for the rest of the session.
    try {
      let shareId: string;
      try {
        if (!asSub || !subTree) {
          shareId = await shareCollection({ collection, boards });
        } else {
          // Same tree, rosters and name scrubbing as ShareWithSubModal.
          const tree = subTree;
          const rosterIds = collectShareRosterIds(
            tree.orderedBoards,
            activeRosterId
          );
          const sharedRosters: SubstituteShareRoster[] =
            subEmails.length > 0
              ? rosters
                  .filter((r) => rosterIds.includes(r.id) && r.driveFileId)
                  .map((r) => ({
                    id: r.id,
                    name: r.name,
                    driveFileId: r.driveFileId as string,
                  }))
              : [];
          const defaultBoardId =
            collection.defaultBoardId ?? tree.boards[0]?.id;
          shareId = await shareSubstituteCollection({
            collection,
            onBundle: (bundle) =>
              setMissed(
                bundle.failures.map((f) => ({
                  id: `${f.kind}-${f.itemId}`,
                  label: f.label,
                }))
              ),
            boards: tree.orderedBoards,
            collectionId: collection.id,
            sourceId: collection.id,
            kind: 'collection',
            sections: tree.sections,
            boardEntries: tree.boards,
            ...(defaultBoardId !== undefined && { defaultBoardId }),
            expiresAt: Date.now() + ttlMs,
            buildingId,
            ...(subEmails.length > 0 ? { subEmails } : {}),
            ...(sharedRosters.length > 0 ? { sharedRosters } : {}),
          });
        }
      } catch (err) {
        logError('ShareCollectionLinkCreatorModal.create', err, {
          mode: asSub ? 'substitute' : 'copy',
          collectionId: collection.id,
          boardCount: boards.length,
          ...(asSub ? { ttlMs, buildingId } : {}),
        });
        // `commitBoardBatches` re-throws partial-failure errors with a
        // descriptive cause that's safe to show — surface verbatim so the
        // host knows "X of Y boards committed" rather than a generic toast.
        const message =
          err instanceof Error
            ? err.message
            : t('shareCollection.createFailed', {
                defaultValue: 'Failed to create Collection share',
              });
        addToast(message, 'error');
        return;
      }
      const url = asSub
        ? `${window.location.origin}/subs/s/${shareId}`
        : `${window.location.origin}/share-collection/${shareId}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopyState('copied');
      } catch (err) {
        setCopyState('failed');
        logError('ShareCollectionLinkCreatorModal.clipboard', err);
      }
    } finally {
      setBusy(false);
    }
  }, [
    offerSubstitute,
    mode,
    ttlMs,
    buildingId,
    teacherBuildings,
    subEmails,
    rosters,
    activeRosterId,
    subTree,
    collection,
    boards,
    shareCollection,
    shareSubstituteCollection,
    addToast,
    t,
  ]);

  if (!isOpen || !collection) return null;

  return (
    <div
      className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Folder
            className="w-5 h-5 flex-shrink-0"
            style={collection.color ? { color: collection.color } : undefined}
          />
          <h2 id={headingId} className="text-lg font-bold text-slate-800">
            {t('shareCollection.title', {
              defaultValue: 'Share Collection',
            })}
            : <span className="font-normal">{collection.name}</span>
          </h2>
        </div>

        {!shareUrl && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-600">
              {t('shareCollection.subtitle', {
                count:
                  subTree && mode === 'substitute'
                    ? subTree.orderedBoards.length
                    : boards.length,
                defaultValue:
                  'Sharing {{count}} board(s) from this Collection.',
              })}
            </p>
            {!offerSubstitute && (
              <p className="text-xs text-slate-500">
                {t('shareCollection.copyModeHint', {
                  defaultValue: 'They get their own copy to edit.',
                })}
              </p>
            )}
            {offerSubstitute && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('shareCollection.mode', { defaultValue: 'Share Mode' })}
                </legend>
                <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'copy'}
                    onChange={() => setMode('copy')}
                    className="mt-1"
                  />
                  <span className="flex-1">
                    <span className="flex items-center gap-1 text-sm font-bold text-slate-800">
                      <Copy className="w-3.5 h-3.5" />
                      {t('shareCollection.copyMode', { defaultValue: 'Copy' })}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {t('shareCollection.copyModeHint', {
                        defaultValue: 'They get their own copy to edit.',
                      })}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'substitute'}
                    onChange={() => setMode('substitute')}
                    className="mt-1"
                  />
                  <span className="flex-1">
                    <span className="flex items-center gap-1 text-sm font-bold text-slate-800">
                      <UserCheck className="w-3.5 h-3.5" />
                      {t('shareCollection.substituteMode', {
                        defaultValue: 'Substitute (view-only)',
                      })}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {t('shareCollection.substituteModeHint', {
                        defaultValue:
                          'Shows in the Substitute Portal for the time you set.',
                      })}
                    </span>
                  </span>
                </label>
              </fieldset>
            )}

            {offerSubstitute && mode === 'substitute' && (
              <div className="space-y-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('shareCollection.expiresIn', {
                    defaultValue: 'Expires in',
                  })}
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {SUB_TTL_PRESETS.map((p) => (
                    <button
                      key={p.ms}
                      type="button"
                      onClick={() => setTtlMs(p.ms)}
                      className={`text-xxs font-bold py-1.5 rounded-md transition-colors ${
                        ttlMs === p.ms
                          ? 'bg-brand-blue-primary text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <label
                  htmlFor={buildingSelectId}
                  className="block text-xs font-bold text-slate-500 uppercase tracking-wider"
                >
                  {t('shareCollection.building', { defaultValue: 'Building' })}
                </label>
                <select
                  id={buildingSelectId}
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-slate-300 rounded bg-white"
                >
                  <option value="">
                    {t('shareCollection.selectBuilding', {
                      defaultValue: '— Select building —',
                    })}
                  </option>
                  {teacherBuildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('shareCollection.shareRosters', {
                    defaultValue: 'Share rosters with sub(s)?',
                  })}{' '}
                  <span className="text-slate-400 font-normal normal-case">
                    {t('shareLinkCreatorModal.plcScope.optional', {
                      defaultValue: '(optional)',
                    })}
                  </span>
                </label>
                <p className="text-[10px] text-slate-500 -mt-1 leading-relaxed">
                  {t('shareCollection.shareRostersHint', {
                    defaultValue:
                      'Listed subs get read-only Drive access to your rosters until the share ends. They need an @orono.k12.mn.us account.',
                  })}
                </p>

                {presetEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {presetEmails.map((email) => {
                      // usePresetSubEmails already normalizes (trim +
                      // lowercase) at the source — no per-consumer
                      // re-normalization needed here.
                      const added = subEmails.includes(email);
                      return (
                        <button
                          key={email}
                          type="button"
                          // Also gate on validity — usePresetSubEmails
                          // normalizes but doesn't validate the Orono
                          // domain, so an invalid or (pre-fix) empty-string
                          // preset would otherwise render enabled and
                          // permanently inert (the onClick guard below
                          // silently no-ops on it with no error feedback).
                          disabled={added || !isValidOronoEmail(email)}
                          onClick={() =>
                            // Mirror the typed-input path: validate against
                            // the Orono domain and de-dupe before adding
                            // (matches handleAddSubEmail above). `disabled`
                            // already blocks re-adds, but keep the list clean
                            // even if a preset ever comes from a
                            // non-hardcoded source.
                            setSubEmails((prev) =>
                              !isValidOronoEmail(email) || prev.includes(email)
                                ? prev
                                : [...prev, email]
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                            added
                              ? 'bg-emerald-100 text-emerald-700 cursor-default'
                              : !isValidOronoEmail(email)
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-50'
                                : 'bg-brand-blue-lighter/40 text-brand-blue-primary hover:bg-brand-blue-lighter/70'
                          }`}
                        >
                          {added ? (
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

                {subEmails.length > 0 && (
                  <ul className="space-y-1">
                    {subEmails.map((email) => (
                      <li
                        key={email}
                        className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-2 py-1 text-xs text-slate-700"
                      >
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate flex-1">{email}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSubEmails((prev) =>
                              prev.filter((e) => e !== email)
                            )
                          }
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
                    aria-label={t('shareCollection.subEmail', {
                      defaultValue: 'Sub email',
                    })}
                    value={subEmailDraft}
                    onChange={(e) => {
                      setSubEmailDraft(e.target.value);
                      setSubEmailError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubEmail();
                      }
                    }}
                    placeholder={`name${ORONO_EMAIL_DOMAIN}`}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubEmail}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('shareLinkCreatorModal.substitute.addEmail', {
                      defaultValue: 'Add',
                    })}
                  </button>
                </div>
                {subEmailError && (
                  <p className="text-[10px] text-red-600">{subEmailError}</p>
                )}
              </div>
            )}

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
                onClick={() => void handleCreate()}
                disabled={busy}
                className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-50"
              >
                {busy
                  ? t('shareCollection.creating', {
                      defaultValue: 'Creating…',
                    })
                  : t('shareCollection.createLink', {
                      defaultValue: 'Create link',
                    })}
              </button>
            </div>
          </div>
        )}

        {shareUrl && (
          <div className="p-5 space-y-3">
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
                  {t('shareCollection.missedHelp', {
                    defaultValue:
                      'Your sub will see these empty. Open the board, check the widget loads, then share the collection again.',
                  })}
                </p>
              </div>
            )}
            {copyState === 'copied' && (
              <p className="text-sm text-slate-600">
                {t('shareCollection.linkCopied', {
                  defaultValue: 'Share link copied to clipboard.',
                })}
              </p>
            )}
            {copyState === 'failed' && (
              <p className="text-sm text-amber-600">
                {t('shareCollection.linkCopyFailed', {
                  defaultValue:
                    'Copy the link below — clipboard access was blocked.',
                })}
              </p>
            )}
            {copyState === 'unknown' && (
              <p className="text-sm text-slate-600">
                {t('shareCollection.linkReady', {
                  defaultValue: 'Share link ready.',
                })}
              </p>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                readOnly
                value={shareUrl}
                aria-label={t('shareCollection.urlLabel', {
                  defaultValue: 'Share collection URL',
                })}
                className="flex-1 px-2 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded select-all"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      setCopyState('copied');
                    } catch (err) {
                      setCopyState('failed');
                      logError(
                        'ShareCollectionLinkCreatorModal.manualCopy',
                        err
                      );
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
      </div>
    </div>
  );
};
