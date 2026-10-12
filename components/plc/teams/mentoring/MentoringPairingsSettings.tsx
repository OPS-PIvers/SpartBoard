// Team settings for a mentoring program (T29): facilitators tag mentors and mentees and set the pairs.

import React, { useState } from 'react';
import { Button } from '@/components/common/Button';
import { useAuth } from '@/context/useAuth';
import {
  createPairing,
  removePairing,
  setMemberMentorRole,
  useMentoringWorkspaces,
} from '@/hooks/useMentoring';
import type { Plc, PlcMentorRole } from '@/types';
import { logError } from '@/utils/logError';
import { mentoringRoster, pairNames } from '@/utils/mentoring';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

const SELECT =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30';
const HEADING = 'text-sm font-bold text-slate-800';

export const MentoringPairingsSettings: React.FC<{ plc: Plc }> = ({ plc }) => {
  const { user } = useAuth();
  const { items: workspaces } = useMentoringWorkspaces(
    plc.id,
    user?.uid ?? null,
    true
  );
  const [mentor, setMentor] = useState('');
  const [mentee, setMentee] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const roster = mentoringRoster(plc);
  const members = Object.values(plc.members ?? {})
    .filter((m) => m.status === 'active' && m.role === 'member')
    .sort((a, b) =>
      (a.displayName || a.email).localeCompare(b.displayName || b.email)
    );

  const run = async (fn: () => Promise<unknown>, where: string) => {
    setBusy(true);
    setFailed(false);
    try {
      await fn();
    } catch (err) {
      logError(`MentoringPairingsSettings.${where}`, err, { plcId: plc.id });
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 border-t border-slate-200 pt-4">
      <div>
        <h3 className={HEADING}>Mentors and mentees</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.uid} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                {m.displayName || m.email}
              </span>
              <select
                aria-label={m.displayName || m.email}
                className={SELECT}
                disabled={busy}
                {...tourFieldAttr(
                  'teams.pairing.member-role',
                  'teams-mentoring',
                  m.uid
                )}
                value={m.mentorRole ?? ''}
                onChange={(e) =>
                  void run(
                    () =>
                      setMemberMentorRole(
                        plc.id,
                        m.uid,
                        (e.target.value || null) as PlcMentorRole | null
                      ),
                    'role'
                  )
                }
              >
                <option value="">Member</option>
                <option value="mentor">Mentor</option>
                <option value="mentee">Mentee</option>
              </select>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className={HEADING}>Pairs</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {workspaces.map((ws) => {
            const names = pairNames(plc, ws);
            return (
              <li key={ws.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                  <span className="font-semibold">{names.mentor}</span>{' '}
                  <span className="text-slate-400">and</span>{' '}
                  <span className="font-semibold">{names.mentee}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  {...tourFieldAttr(
                    'teams.pairing.remove',
                    'teams-mentoring',
                    ws.id
                  )}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Remove this pair? Their workspace is deleted.'
                      )
                    ) {
                      void run(() => removePairing(plc.id, ws.id), 'remove');
                    }
                  }}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Mentor"
            {...tourAttr('teams.pairing.mentor-select')}
            className={SELECT}
            value={mentor}
            onChange={(e) => setMentor(e.target.value)}
          >
            <option value="">Mentor</option>
            {roster.mentor.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-400">and</span>
          <select
            aria-label="Mentee"
            {...tourAttr('teams.pairing.mentee-select')}
            className={SELECT}
            value={mentee}
            onChange={(e) => setMentee(e.target.value)}
          >
            <option value="">Mentee</option>
            {roster.mentee.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !mentor || !mentee}
            {...tourAttr('teams.pairing.add')}
            onClick={() =>
              void run(async () => {
                await createPairing(plc, mentor, mentee);
                setMentor('');
                setMentee('');
              }, 'pair')
            }
          >
            Add pair
          </Button>
        </div>
        {failed && (
          <p className="mt-2 text-xs text-brand-red-primary">
            Couldn&apos;t save that change. Try again.
          </p>
        )}
      </div>
    </div>
  );
};
