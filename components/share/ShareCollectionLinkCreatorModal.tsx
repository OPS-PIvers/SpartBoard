import { type FC, useState, useId, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Copy, UserCheck, Mail, Plus, Trash2 } from 'lucide-react';
import type { Collection, Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { usePresetSubEmails } from '@/hooks/usePresetSubEmails';
import { BUILDINGS } from '@/config/buildings';
import { logError } from '@/utils/logError';

interface ShareCollectionLinkCreatorModalProps {
  isOpen: boolean;
  collection: Collection | null;
  /** Boards currently in the Collection. Frozen at modal open. */
  boards: Dashboard[];
  onClose: () => void;
}

type ModeChoice = 'copy' | 'substitute';
type CopyState = 'unknown' | 'copied' | 'failed';

const BUILDING_IDS = new Set(BUILDINGS.map((b) => b.id));
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
  } = useDashboard();
  const [mode, setMode] = useState<ModeChoice>('copy');
  const [ttlMs, setTtlMs] = useState<number>(SUB_TTL_PRESETS[1].ms);
  const [buildingId, setBuildingId] = useState<string>('');
  const [subEmails, setSubEmails] = useState<string[]>([]);
  const [subEmailDraft, setSubEmailDraft] = useState('');
  const [subEmailError, setSubEmailError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('unknown');
  const [busy, setBusy] = useState(false);
  const headingId = useId();

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
    setSubEmails((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed]
    );
    setSubEmailDraft('');
    setSubEmailError(null);
  }, [subEmailDraft, t]);

  const handleCreate = useCallback(async () => {
    if (!collection) return;
    // Validate substitute prerequisites BEFORE flipping busy so an early
    // return doesn't paint the modal as "creating share".
    if (mode === 'substitute') {
      if (!buildingId || !BUILDING_IDS.has(buildingId)) {
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
        if (mode === 'copy') {
          shareId = await shareCollection({ collection, boards });
        } else {
          // Mirror the single-board substitute share: surface the active
          // roster's Drive file to the listed subs (read-only, auto-revoked
          // on expiry). v1 = active roster only; empty list is fine (share
          // still works, just without sub-readable roster names).
          const activeRoster = rosters.find((r) => r.id === activeRosterId);
          const rosterDriveFileIds =
            subEmails.length > 0 && activeRoster?.driveFileId
              ? [activeRoster.driveFileId]
              : undefined;
          shareId = await shareSubstituteCollection({
            collection,
            boards,
            collectionId: collection.id,
            expiresAt: Date.now() + ttlMs,
            buildingId,
            ...(subEmails.length > 0 ? { subEmails } : {}),
            ...(rosterDriveFileIds ? { rosterDriveFileIds } : {}),
          });
        }
      } catch (err) {
        logError('ShareCollectionLinkCreatorModal.create', err, {
          mode,
          collectionId: collection.id,
          boardCount: boards.length,
          ...(mode === 'substitute' ? { ttlMs, buildingId } : {}),
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
      const url = `${window.location.origin}/share-collection/${shareId}`;
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
    mode,
    ttlMs,
    buildingId,
    subEmails,
    rosters,
    activeRosterId,
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
                count: boards.length,
                defaultValue:
                  'Sharing {{count}} board(s) from this Collection.',
              })}
            </p>
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
                      defaultValue:
                        'Recipient imports a full copy into their account.',
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
                        'A sub teacher sees the Collection in /subs for the window you choose.',
                    })}
                  </span>
                </span>
              </label>
            </fieldset>

            {mode === 'substitute' && (
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
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('shareCollection.building', { defaultValue: 'Building' })}
                </label>
                <select
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-slate-300 rounded bg-white"
                >
                  <option value="">
                    {t('shareCollection.selectBuilding', {
                      defaultValue: '— Select building —',
                    })}
                  </option>
                  {BUILDINGS.map((b) => (
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
                      'Listed subs get read-only Google Drive access to your active roster until expiration. Auto-revoked then. Must be @orono.k12.mn.us.',
                  })}
                </p>

                {presetEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {presetEmails.map((email) => {
                      const added = subEmails.includes(email);
                      return (
                        <button
                          key={email}
                          type="button"
                          disabled={added}
                          onClick={() =>
                            // Mirror the typed-input path: validate against the
                            // Orono domain and de-dupe before adding. `disabled`
                            // already blocks re-adds in normal use, but keeping
                            // the guard here means the list stays clean even if
                            // a preset ever comes from a non-hardcoded source.
                            setSubEmails((prev) =>
                              !isValidOronoEmail(email) || prev.includes(email)
                                ? prev
                                : [...prev, email]
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                            added
                              ? 'bg-emerald-100 text-emerald-700 cursor-default'
                              : 'bg-brand-blue-lighter/40 text-brand-blue-primary hover:bg-brand-blue-lighter/70'
                          }`}
                        >
                          <Plus className="w-3 h-3" />
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
