/**
 * ShareLinkCreatorModal — host-side share link creator. The host picks one
 * of four modes:
 *
 *   1. Synced / View-Only / Copy — peer teachers. Writes a
 *      `/shared_boards/{shareId}` doc with `intendedMode` set, recipient
 *      lands at `/share/{shareId}`.
 *   2. Substitute (View-Only) — a frozen, time-boxed, building-scoped board
 *      that subs find by browsing `/subs`. Writes a `/shared_boards/{shareId}`
 *      doc with `intendedMode: 'substitute'` plus extra fields (expiresAt,
 *      buildingId, initialState, subEmails). Distinct write path because
 *      substitute shares never live-mirror the host's edits.
 */

import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cloud,
  Copy,
  Eye,
  Check,
  ExternalLink,
  GraduationCap,
  Mail,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { usePlcs } from '@/hooks/usePlcs';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { usePresetSubEmails } from '@/hooks/usePresetSubEmails';
import { BUILDINGS, canonicalBuildingId } from '@/config/buildings';
import type { Dashboard } from '@/types';
import type { SharedBoardImportMode } from '@/context/DashboardContextValue';

// `SharedBoardImportMode` excludes 'substitute' on purpose (substitute shares
// are never imported into a teacher's account), so this widened union is the
// modal-local shape for the picker.
type ShareMode = SharedBoardImportMode | 'substitute';

// Default 48h expiration window per the plan; enforce a 14-day max at submit.
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
  const d = new Date(
    Date.now() + DEFAULT_SUB_EXPIRATION_HOURS * 60 * 60 * 1000
  );
  return formatLocalDateTime(d);
}

function isValidOronoEmail(email: string): boolean {
  return /^[^\s@]+@orono\.k12\.mn\.us$/i.test(email.trim());
}

interface ShareLinkCreatorModalProps {
  dashboard: Dashboard | null;
  isOpen: boolean;
  onClose: () => void;
}

interface ModeOptionProps {
  mode: ShareMode;
  selected: boolean;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
  onPick: (mode: ShareMode) => void;
}

const ModeOption: React.FC<ModeOptionProps> = ({
  mode,
  selected,
  title,
  body,
  Icon,
  onPick,
}) => {
  return (
    <button
      type="button"
      onClick={() => onPick(mode)}
      className={`w-full text-left rounded-xl border bg-white px-4 py-4 transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 cursor-pointer ${
        selected
          ? 'border-brand-blue-primary shadow-md ring-1 ring-brand-blue-lighter'
          : 'border-slate-200 hover:border-brand-blue-primary hover:shadow-sm'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
            selected
              ? 'bg-brand-blue-primary text-white'
              : 'bg-brand-blue-lighter/40 text-brand-blue-primary'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">{body}</p>
        </div>
        {selected && (
          <div className="shrink-0 self-center text-brand-blue-primary">
            <Check className="w-5 h-5" />
          </div>
        )}
      </div>
    </button>
  );
};

export const ShareLinkCreatorModal: React.FC<ShareLinkCreatorModalProps> = ({
  dashboard,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const {
    shareDashboard,
    shareSubstituteDashboard,
    rosters,
    activeRosterId,
    addToast,
  } = useDashboard();
  const { canAccessFeature, selectedBuildings } = useAuth();
  const { plcs } = usePlcs();
  const adminBuildings = useAdminBuildings();
  const [mode, setMode] = useState<ShareMode>('synced');
  // Phase 6 — optional PLC scope. `null` (default) means a plain share
  // link with no PLC affiliation. Picking a PLC tags the resulting share
  // doc with `plcId`, surfacing it on that PLC's Shared Boards tab in
  // addition to whoever the host sends the link to.
  const [plcId, setPlcId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Substitute-mode config state (Phase A — UI only).
  const teacherBuildings = useMemo(() => {
    const list = adminBuildings.length > 0 ? adminBuildings : BUILDINGS;
    return list.map((b) => ({ id: canonicalBuildingId(b.id), name: b.name }));
  }, [adminBuildings]);
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
  const [subBuildingId, setSubBuildingId] = useState(defaultBuildingId);
  const [subExpiresAt, setSubExpiresAt] = useState(defaultExpirationIso());
  const [subEmails, setSubEmails] = useState<string[]>([]);
  const [subEmailDraft, setSubEmailDraft] = useState('');
  const [subEmailError, setSubEmailError] = useState<string | null>(null);

  const { emails: presetEmails } = usePresetSubEmails(subBuildingId);

  // Reset modal state every time it opens for a new dashboard. Gated on the
  // false→true transition of `isOpen` (and dashboard id change) so an async
  // resolution of `defaultBuildingId` mid-session doesn't clobber a user's
  // building pick.
  const prevOpenRef = useRef(false);
  const prevDashboardIdRef = useRef<string | null | undefined>(dashboard?.id);
  React.useEffect(() => {
    const justOpened = isOpen && !prevOpenRef.current;
    const dashboardChanged =
      isOpen && prevDashboardIdRef.current !== dashboard?.id;
    prevOpenRef.current = isOpen;
    prevDashboardIdRef.current = dashboard?.id;
    if (justOpened || dashboardChanged) {
      setMode('synced');
      setPlcId(null);
      setCreating(false);
      setCreatedUrl(null);
      setCopied(false);
      setSubBuildingId(defaultBuildingId);
      setSubExpiresAt(defaultExpirationIso());
      setSubEmails([]);
      setSubEmailDraft('');
      setSubEmailError(null);
    }
  }, [isOpen, dashboard?.id, defaultBuildingId]);

  // If the modal is already open and `subBuildingId` is empty (admin
  // buildings hadn't resolved at open time), seed it from the default once
  // the default becomes available — without clobbering an existing pick.
  // Also reconcile when the available buildings list changes and the
  // current selection is no longer present (modal opened with the
  // fallback BUILDINGS list, then org-specific list arrived and dropped
  // that id) — without this the share would write a building id subs
  // never see in their picker.
  React.useEffect(() => {
    if (!isOpen) return;
    if (!subBuildingId && defaultBuildingId) {
      setSubBuildingId(defaultBuildingId);
      return;
    }
    if (
      subBuildingId &&
      teacherBuildings.length > 0 &&
      !teacherBuildings.some((b) => b.id === subBuildingId) &&
      defaultBuildingId
    ) {
      setSubBuildingId(defaultBuildingId);
    }
  }, [isOpen, subBuildingId, defaultBuildingId, teacherBuildings]);

  if (!isOpen || !dashboard) return null;

  const canShare = canAccessFeature('dashboard-sharing');

  const handleAddSubEmail = () => {
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
    if (subEmails.includes(trimmed)) {
      setSubEmailDraft('');
      return;
    }
    setSubEmails((prev) => [...prev, trimmed]);
    setSubEmailDraft('');
  };

  const handleCreate = async () => {
    if (!canShare || creating) return;

    if (mode === 'substitute') {
      if (!subBuildingId) {
        addToast(
          t('shareLinkCreatorModal.substitute.buildingRequired', {
            defaultValue: 'Pick a building before creating a sub link.',
          }),
          'error'
        );
        return;
      }
      const parsedExpiresAt = new Date(subExpiresAt).getTime();
      if (!Number.isFinite(parsedExpiresAt) || parsedExpiresAt <= Date.now()) {
        addToast(
          t('shareLinkCreatorModal.substitute.expiresInPast', {
            defaultValue: 'Pick an expiration in the future.',
          }),
          'error'
        );
        return;
      }
      if (parsedExpiresAt > Date.now() + MAX_SUB_EXPIRATION_MS) {
        addToast(
          t('shareLinkCreatorModal.substitute.expiresTooFar', {
            defaultValue: 'Substitute shares can last at most 14 days.',
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

      // Collect Drive file ids for the rosters the host wants to share with
      // the sub. v1 = just the active roster; if the dashboard's randomizer
      // pulls from a different one, the host can adjust later. Empty list
      // is fine — the share still works, just without sub-readable names.
      const activeRoster = rosters.find((r) => r.id === activeRosterId);
      const rosterDriveFileIds: string[] = [];
      if (subEmails.length > 0 && activeRoster?.driveFileId) {
        rosterDriveFileIds.push(activeRoster.driveFileId);
      }

      setCreating(true);
      try {
        await shareSubstituteDashboard({
          dashboard,
          expiresAt: parsedExpiresAt,
          buildingId: subBuildingId,
          subEmails: subEmails.length > 0 ? subEmails : undefined,
          rosterDriveFileIds:
            rosterDriveFileIds.length > 0 ? rosterDriveFileIds : undefined,
        });
        // Subs reach this board by browsing /subs filtered to their building —
        // they don't follow a /share/{shareId} link — so the success panel
        // shows the /subs entry URL instead of a per-share URL.
        setCreatedUrl(`${window.location.origin}/subs`);
      } catch (err) {
        console.error('Substitute share failed:', err);
        addToast(
          t('shareLinkCreatorModal.toast.createFailed', {
            defaultValue: 'Failed to create share link',
          }),
          'error'
        );
      } finally {
        setCreating(false);
      }
      return;
    }

    setCreating(true);
    try {
      const shareId = await shareDashboard(dashboard, mode, plcId ?? undefined);
      const url = `${window.location.origin}/share/${shareId}`;
      setCreatedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        // Clipboard may fail under restrictive focus rules — user can still
        // hit the manual Copy button in the success panel.
      }
    } catch (err) {
      console.error('Share failed:', err);
      addToast(
        t('shareLinkCreatorModal.toast.createFailed', {
          defaultValue: 'Failed to create share link',
        }),
        'error'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      addToast(
        t('shareLinkCreatorModal.toast.copied', {
          defaultValue: 'Link copied',
        }),
        'success'
      );
    } catch {
      addToast(
        t('shareLinkCreatorModal.toast.copyFailed', {
          defaultValue:
            'Could not copy automatically — select the link to copy manually',
        }),
        'error'
      );
    }
  };

  const modeLabel =
    mode === 'synced'
      ? t('shareLinkCreatorModal.modeLabel.synced', { defaultValue: 'Synced' })
      : mode === 'view-only'
        ? t('shareLinkCreatorModal.modeLabel.viewOnly', {
            defaultValue: 'View-Only',
          })
        : mode === 'substitute'
          ? t('shareLinkCreatorModal.modeLabel.substitute', {
              defaultValue: 'Substitute (View-Only)',
            })
          : t('shareLinkCreatorModal.modeLabel.copy', { defaultValue: 'Copy' });

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel={t('shareLinkCreatorModal.ariaLabel', {
        defaultValue: 'Create share link',
      })}
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <ExternalLink className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {createdUrl
                  ? t('shareLinkCreatorModal.titleReady', {
                      defaultValue: 'Link ready',
                    })
                  : t('shareLinkCreatorModal.titleCreate', {
                      defaultValue: 'Share board',
                    })}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {dashboard.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('shareLinkCreatorModal.close', {
              defaultValue: 'Close',
            })}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      {createdUrl ? (
        <div className="px-5 pb-5 pt-4 space-y-4">
          {mode === 'substitute' ? (
            <p className="text-xs text-slate-600">
              {t('shareLinkCreatorModal.substitute.readyBlurb', {
                defaultValue:
                  'Your sub board is live. Subs in this building can open it from the Substitute Portal at the link below.',
              })}
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              {t('shareLinkCreatorModal.receivedAsBefore', {
                defaultValue: 'Anyone you send this link to will receive it as',
              })}{' '}
              <span className="font-bold text-slate-800">{modeLabel}</span>.
            </p>
          )}
          {mode === 'substitute' && (
            <div className="rounded-lg border border-brand-blue-lighter bg-brand-blue-lighter/10 px-3 py-2 text-[11px] text-slate-600 space-y-1">
              <div>
                <span className="font-bold text-slate-800">Expires:</span>{' '}
                {new Date(new Date(subExpiresAt).getTime()).toLocaleString(
                  undefined,
                  {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }
                )}
              </div>
              {subEmails.length > 0 && (
                <div>
                  <span className="font-bold text-slate-800">
                    Drive access granted to:
                  </span>{' '}
                  {subEmails.join(', ')}
                </div>
              )}
              {subEmails.length === 0 && (
                <div className="text-slate-500">
                  No sub emails listed — the randomizer will fall back to its
                  manual-mode names.
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              type="text"
              readOnly
              value={createdUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-transparent text-xs text-slate-700 truncate focus:outline-none"
              aria-label={t('shareLinkCreatorModal.urlAriaLabel', {
                defaultValue: 'Share link URL',
              })}
            />
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                copied
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  {t('shareLinkCreatorModal.copied', {
                    defaultValue: 'Copied',
                  })}
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  {t('shareLinkCreatorModal.copy', { defaultValue: 'Copy' })}
                </>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2 transition-colors cursor-pointer"
          >
            {t('shareLinkCreatorModal.done', { defaultValue: 'Done' })}
          </button>
        </div>
      ) : (
        <div className="px-5 pb-5 pt-4 space-y-3">
          <p className="text-xs text-slate-600">
            {t('shareLinkCreatorModal.prompt', {
              defaultValue:
                'How should the people you share with receive this board?',
            })}
          </p>
          <ModeOption
            mode="synced"
            selected={mode === 'synced'}
            title={t('shareLinkCreatorModal.modes.synced.title', {
              defaultValue: 'Synced',
            })}
            body={t('shareLinkCreatorModal.modes.synced.body', {
              defaultValue:
                "Both of you stay in sync — anything either teacher changes appears on the other's board in real time.",
            })}
            Icon={Cloud}
            onPick={setMode}
          />
          <ModeOption
            mode="view-only"
            selected={mode === 'view-only'}
            title={t('shareLinkCreatorModal.modes.viewOnly.title', {
              defaultValue: 'View-Only',
            })}
            body={t('shareLinkCreatorModal.modes.viewOnly.body', {
              defaultValue:
                "They see your live edits but can't change anything. Their copy is removed when you stop sharing.",
            })}
            Icon={Eye}
            onPick={setMode}
          />
          <ModeOption
            mode="copy"
            selected={mode === 'copy'}
            title={t('shareLinkCreatorModal.modes.copy.title', {
              defaultValue: 'Make a copy',
            })}
            body={t('shareLinkCreatorModal.modes.copy.body', {
              defaultValue:
                'They get a one-time snapshot. Edits stay private — your boards drift apart immediately.',
            })}
            Icon={Copy}
            onPick={setMode}
          />
          <ModeOption
            mode="substitute"
            selected={mode === 'substitute'}
            title={t('shareLinkCreatorModal.modes.substitute.title', {
              defaultValue: 'Substitute (View-Only)',
            })}
            body={t('shareLinkCreatorModal.modes.substitute.body', {
              defaultValue:
                "Hand off a frozen snapshot to a sub. They can start timers, shuffle the randomizer, and use widgets — but can't move or change them. Expires automatically.",
            })}
            Icon={GraduationCap}
            onPick={setMode}
          />
          {mode === 'substitute' && (
            <div className="rounded-xl border border-brand-blue-lighter bg-brand-blue-lighter/10 px-4 py-3 space-y-3">
              <div className="flex items-start gap-2 text-[11px] text-slate-600 leading-relaxed">
                <GraduationCap className="w-4 h-4 shrink-0 text-brand-blue-primary mt-0.5" />
                <span>
                  {t('shareLinkCreatorModal.substitute.intro', {
                    // Derive the portal URL at render time so dev preview
                    // deployments (e.g. spartboard--dev-paul-XXXXXXXX.web.app)
                    // show the URL that subs would actually use on that host.
                    portalUrl: `${window.location.host}/subs`,
                    defaultValue:
                      'Subs sign in at {{portalUrl}}, pick this building, and open your board for the day.',
                  })}
                </span>
              </div>

              <div>
                <label
                  htmlFor="sub-expires-at"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  {t('shareLinkCreatorModal.substitute.expiresLabel', {
                    defaultValue: 'Expires on',
                  })}
                </label>
                <input
                  id="sub-expires-at"
                  type="datetime-local"
                  value={subExpiresAt}
                  onChange={(e) => setSubExpiresAt(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  {t('shareLinkCreatorModal.substitute.expiresHint', {
                    defaultValue:
                      'Defaults to 48 hours from now. Maximum 14 days.',
                  })}
                </p>
              </div>

              <div>
                <label
                  htmlFor="sub-building"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  {t('shareLinkCreatorModal.substitute.buildingLabel', {
                    defaultValue: 'Building',
                  })}{' '}
                  <span className="text-red-500" aria-hidden>
                    *
                  </span>
                </label>
                <select
                  id="sub-building"
                  value={subBuildingId}
                  onChange={(e) => setSubBuildingId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                >
                  {teacherBuildings.length === 0 && (
                    <option value="">
                      {t('shareLinkCreatorModal.substitute.noBuildings', {
                        defaultValue: 'No buildings configured',
                      })}
                    </option>
                  )}
                  {teacherBuildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-500">
                  {t('shareLinkCreatorModal.substitute.buildingHint', {
                    defaultValue:
                      'Pre-filled from your "My Buildings" setting. Subs filter by building when they sign in.',
                  })}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('shareLinkCreatorModal.substitute.emailsLabel', {
                    defaultValue: 'Share rosters with sub(s)?',
                  })}{' '}
                  <span className="text-slate-400 font-normal">
                    {t('shareLinkCreatorModal.plcScope.optional', {
                      defaultValue: '(optional)',
                    })}
                  </span>
                </label>
                <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                  {t('shareLinkCreatorModal.substitute.emailsHint', {
                    defaultValue:
                      'Listed subs get read-only Google Drive access to your rosters until expiration. Auto-revoked then. Must be @orono.k12.mn.us.',
                  })}
                </p>

                {presetEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {presetEmails.map((email) => {
                      const added = subEmails.includes(email);
                      return (
                        <button
                          key={email}
                          type="button"
                          disabled={added}
                          onClick={() =>
                            setSubEmails((prev) => [...prev, email])
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
                            added
                              ? 'bg-emerald-100 text-emerald-700 cursor-default'
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
                  <ul className="space-y-1 mb-2">
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
                          className="shrink-0 text-slate-400 hover:text-red-500 cursor-pointer"
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
                    className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubEmail}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('shareLinkCreatorModal.substitute.addEmail', {
                      defaultValue: 'Add',
                    })}
                  </button>
                </div>
                {subEmailError && (
                  <p className="mt-1 text-[10px] text-red-600">
                    {subEmailError}
                  </p>
                )}
              </div>
            </div>
          )}
          {plcs.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 space-y-2">
              <label
                htmlFor="share-plc-scope"
                className="block text-xs font-bold text-slate-700"
              >
                {t('shareLinkCreatorModal.plcScope.label', {
                  defaultValue: 'Also share with a PLC',
                })}{' '}
                <span className="text-slate-400 font-normal">
                  {t('shareLinkCreatorModal.plcScope.optional', {
                    defaultValue: '(optional)',
                  })}
                </span>
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t('shareLinkCreatorModal.plcScope.description', {
                  defaultValue:
                    "Tags this share so it shows up on the picked PLC's Shared Boards tab in addition to whoever you send the link to.",
                })}
              </p>
              <select
                id="share-plc-scope"
                value={plcId ?? ''}
                onChange={(e) => setPlcId(e.target.value || null)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                <option value="">
                  {t('shareLinkCreatorModal.plcScope.none', {
                    defaultValue: "Don't scope to a PLC",
                  })}
                </option>
                {plcs.map((plc) => (
                  <option key={plc.id} value={plc.id}>
                    {plc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!canShare || creating}
            className="w-full rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold text-sm py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {creating
              ? t('shareLinkCreatorModal.creating', {
                  defaultValue: 'Creating link…',
                })
              : t('shareLinkCreatorModal.create', {
                  defaultValue: 'Create link',
                })}
          </button>
        </div>
      )}
    </Modal>
  );
};
