/**
 * PlcIndexHub — the `/plc` landing hub (PRD §2.1, Decision 1.1).
 *
 * Two sections:
 *   1. **Your PLCs** — the PLCs the current user is a member of (from
 *      `usePlcs`, passed down). Clicking one navigates to `/plc/:id`.
 *   2. **PLCs in my building** — a read-only discovery directory of PLCs that
 *      share the user's `orgId` / `buildingId` and that they are NOT already
 *      in (from `usePlcBuildingDirectory`). Each row shows only the team's
 *      name + active member count; because the rules require an invite to
 *      join, the "Ask to join" affordance surfaces a hint pointing the teacher
 *      at the invite path rather than self-adding.
 *
 * Rendered by `PlcRouteHost` when the pathname is exactly `/plc` (no plcId).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Users2,
  ChevronRight,
  ArrowLeft,
  Building2,
  MailPlus,
} from 'lucide-react';

import type { Plc } from '@/types';
import { usePlcBuildingDirectory } from '@/hooks/usePlcBuildingDirectory';
import { getPlcMembers, getPlcRole } from '@/utils/plc';
import { buildPlcPath, spaNavigate } from '@/utils/plcPath';

interface PlcIndexHubProps {
  /** The user's own PLCs (already subscribed by `PlcRouteHost` via `usePlcs`). */
  plcs: Plc[];
  /** Whether the user's PLC list is still loading. */
  loading: boolean;
  /** Current user's uid (drives the "Lead" badge). */
  userUid: string | null;
  /** Current user's email (shown in the join-request hint). */
  userEmail: string | null;
  /** Back-to-board navigation. */
  onClose: () => void;
}

/**
 * The `/plc` landing hub: "Your PLCs" + the "PLCs in my building" directory.
 */
export const PlcIndexHub: React.FC<PlcIndexHubProps> = ({
  plcs,
  loading,
  userUid,
  userEmail,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-modal bg-slate-50 overflow-y-auto overscroll-none">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-brand-blue-primary transition-colors mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary rounded"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('plcRoute.backToBoard', { defaultValue: 'Back to my board' })}
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brand-blue-lighter flex items-center justify-center">
            <Users2 className="w-5 h-5 text-brand-blue-primary" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">
            {t('plcRoute.hubTitle', { defaultValue: 'My PLCs' })}
          </h1>
        </div>
        <p className="text-sm text-slate-500 mb-8">
          {t('plcRoute.hubSubtitle', {
            defaultValue:
              'Open a Professional Learning Community to collaborate with your team.',
          })}
        </p>

        {/* --- Section 1: Your PLCs --- */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-brand-blue-primary animate-spin" />
          </div>
        ) : plcs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <Users2 className="w-6 h-6 text-slate-300" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-slate-600">
              {t('plcRoute.hubEmptyTitle', { defaultValue: 'No PLCs yet' })}
            </p>
            <p className="text-xs text-slate-500">
              {t('plcRoute.hubEmptySubtitle', {
                defaultValue:
                  'Create a PLC from the sidebar and invite your colleagues.',
              })}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {plcs.map((plc) => {
              const isLead = userUid
                ? getPlcRole(plc, userUid) === 'lead'
                : false;
              return (
                <li key={plc.id}>
                  <button
                    type="button"
                    onClick={() => spaNavigate(buildPlcPath(plc.id))}
                    className="group w-full flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl hover:border-brand-blue-primary/40 hover:bg-brand-blue-lighter/20 transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                  >
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-blue-lighter flex items-center justify-center">
                      <Users2 className="w-5 h-5 text-brand-blue-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-800 truncate">
                          {plc.name}
                        </span>
                        {isLead && (
                          <span className="text-xxs font-bold text-brand-blue-primary bg-brand-blue-lighter px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {t('plcRoute.leadBadge', { defaultValue: 'Lead' })}
                          </span>
                        )}
                      </div>
                      <div className="text-xxs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
                        {t('plcRoute.memberCount', {
                          count: getPlcMembers(plc).length,
                          defaultValue: '{{count}} Member',
                          defaultValue_other: '{{count}} Members',
                        })}
                      </div>
                    </div>
                    <ChevronRight
                      className="w-5 h-5 text-slate-300 group-hover:text-brand-blue-primary transition-colors shrink-0"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* --- Section 2: PLCs in my building --- */}
        <PlcBuildingDirectorySection userEmail={userEmail} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// "PLCs in my building" directory
// ---------------------------------------------------------------------------

const PlcBuildingDirectorySection: React.FC<{ userEmail: string | null }> = ({
  userEmail,
}) => {
  const { t } = useTranslation();
  const { entries, loading, orgId } = usePlcBuildingDirectory();

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
          {t('plcDirectory.heading', { defaultValue: 'PLCs in my building' })}
        </h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {t('plcDirectory.subtitle', {
          defaultValue: 'Teams in your building you can ask to join.',
        })}
      </p>

      {!orgId ? (
        <DirectoryNotice
          title={t('plcDirectory.noOrgTitle', {
            defaultValue: 'Building directory unavailable',
          })}
          subtitle={t('plcDirectory.noOrgSubtitle', {
            defaultValue:
              "Your account isn't linked to a school yet, so we can't list nearby PLCs.",
          })}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-blue-primary animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <DirectoryNotice
          title={t('plcDirectory.emptyTitle', {
            defaultValue: 'No other PLCs to show',
          })}
          subtitle={t('plcDirectory.emptySubtitle', {
            defaultValue:
              "There aren't any other PLCs in your building right now.",
          })}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <Users2 className="w-5 h-5 text-slate-400" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-800 truncate">
                  {entry.name}
                </span>
                <span className="block text-xxs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
                  {t('plcDirectory.memberCount', {
                    count: entry.memberCount,
                    defaultValue: '{{count}} member',
                    defaultValue_other: '{{count}} members',
                  })}
                </span>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold">
                  <MailPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('plcDirectory.requestToJoin', {
                    defaultValue: 'Ask to join',
                  })}
                </span>
                {userEmail && (
                  <span className="text-xxs text-slate-500 max-w-[12rem] text-right leading-tight">
                    {t('plcDirectory.requestHint', {
                      defaultValue: 'Ask a member to invite {{email}}.',
                      email: userEmail,
                    })}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const DirectoryNotice: React.FC<{ title: string; subtitle: string }> = ({
  title,
  subtitle,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center bg-white border border-dashed border-slate-200 rounded-2xl">
    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
      <Building2 className="w-5 h-5 text-slate-300" aria-hidden="true" />
    </div>
    <p className="text-sm font-bold text-slate-600">{title}</p>
    <p className="text-xs text-slate-500 max-w-sm">{subtitle}</p>
  </div>
);
