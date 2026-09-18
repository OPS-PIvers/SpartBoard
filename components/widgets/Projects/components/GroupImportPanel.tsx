import React, { useMemo, useState } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import type {
  ClassRoster,
  ProjectGroup,
  ProjectGroupImportEntry,
  ProjectsPendingImport,
} from '@/types';
import { SettingsLabel } from '@/components/common/SettingsLabel';

interface GroupImportPanelProps {
  pending: ProjectsPendingImport;
  rosters: ClassRoster[];
  existingGroups: ProjectGroup[];
  /** True once a run exists; a snapshot cannot be committed before then. */
  canImport: boolean;
  onImport: (entries: ProjectGroupImportEntry[]) => Promise<void>;
  onDiscard: () => void;
}

/**
 * Confirms a group set the Group Maker pushed over (D7/A5). Students with no
 * `classLinkSourcedId` cannot be given an enforceable student side, so they are
 * named here rather than silently dropped (D8).
 */
export const GroupImportPanel: React.FC<GroupImportPanelProps> = ({
  pending,
  rosters,
  existingGroups,
  canImport,
  onImport,
  onDiscard,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carryNames, setCarryNames] = useState(false);

  const roster = rosters.find((r) => r.id === pending.rosterId);
  const classId = roster?.classlinkClassId ?? '';

  const resolved = useMemo(() => {
    const byId = new Map(roster?.students.map((s) => [s.id, s]) ?? []);
    return pending.groups.map((group, index) => {
      const students = group.studentIds
        .map((id) => byId.get(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
      return {
        // D11 — group names default to Group 1..N; carrying the Group Maker's
        // own names across is opt-in, because a name reaches a projected face.
        name: carryNames ? group.name : `Group ${index + 1}`,
        order: index,
        sourcedIds: students
          .map((s) => s.classLinkSourcedId)
          .filter((id): id is string => Boolean(id)),
        unresolvable: students
          .filter((s) => !s.classLinkSourcedId)
          .map((s) => `${s.firstName} ${s.lastName}`.trim()),
      };
    });
  }, [carryNames, pending.groups, roster?.students]);

  const unresolvable = resolved.flatMap((g) => g.unresolvable);

  // D9 — a re-import never overwrites a running group set, so the entries get
  // fresh ids and land alongside whatever is already being tracked.
  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      await onImport(
        resolved.map((group) => ({
          id: crypto.randomUUID(),
          name: group.name,
          classId,
          order: existingGroups.length + group.order,
          classLinkSourcedIds: group.sourcedIds,
        }))
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : 'The groups could not be imported.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-blue-lighter bg-brand-blue-lighter/20 p-3 space-y-3">
      <SettingsLabel icon={Users} as="span">
        Groups from Group Maker
      </SettingsLabel>

      {!roster ? (
        <p className="text-xs text-brand-red-primary">
          The class these groups came from is no longer on this account, so the
          students cannot be resolved. Send them over again.
        </p>
      ) : !classId ? (
        <p className="text-xs text-brand-red-primary">
          {roster.name} is a hand-built roster, so students here have no
          district account to sign in with. Import the groups anyway for a
          teacher-only tracker, or use a ClassLink class for the student side.
        </p>
      ) : null}

      <ul className="space-y-1">
        {resolved.map((group) => (
          <li
            key={group.name}
            className="flex items-center justify-between text-sm text-slate-700"
          >
            <span className="font-semibold">{group.name}</span>
            <span className="text-xs text-slate-500">
              {group.sourcedIds.length} student
              {group.sourcedIds.length === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={carryNames}
          onChange={(e) => setCarryNames(e.target.checked)}
          className="rounded border-slate-300"
        />
        Use the Group Maker&apos;s own group names on the board
      </label>

      {unresolvable.length > 0 && (
        <p className="text-xs text-amber-700">
          {unresolvable.join(', ')} {unresolvable.length === 1 ? 'has' : 'have'}{' '}
          no district account on this roster, so{' '}
          {unresolvable.length === 1 ? 'they' : 'they'} cannot update their
          group. You can still track them yourself.
        </p>
      )}

      {!canImport && (
        <p className="text-xs text-slate-600">
          Pick a project above first — the groups need something to track.
        </p>
      )}

      {error && <p className="text-xs text-brand-red-primary">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={busy || !canImport || !roster}
          className="flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {busy ? 'Importing…' : `Import ${resolved.length} groups`}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  );
};
