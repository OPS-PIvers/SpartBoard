import React, { useMemo, useRef, useState } from 'react';
import {
  Users,
  Plus,
  Upload,
  Search,
  Mail,
  KeyRound,
  UserMinus,
  UserCheck,
  Trash2,
  Edit3,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import type {
  BuildingRecord,
  RoleRecord,
  UserRecord,
  UserStatus,
} from '../types';
import {
  Avatar,
  Badge,
  Btn,
  CellPopover,
  Checkbox,
  Field,
  Input,
  PopoverOption,
  RowMenu,
  Segmented,
  Select,
  StatusPill,
  ViewHeader,
  LocalModal,
  Textarea,
} from '../components/primitives';
import { parseInvitesCsv, type InviteIntent } from '@/utils/csvImport';

interface Props {
  users: UserRecord[];
  roles: RoleRecord[];
  buildings: BuildingRecord[];
  actorRole: 'super_admin' | 'domain_admin' | 'building_admin';
  actorBuildingIds: string[];
  /**
   * `true` when the `getOrgUserActivity` callable reported a partial result —
   * at least one Firebase Auth `getUsers` batch failed. Some "Never signed in"
   * rows may actually be active; the banner prompts admins to refresh rather
   * than act on incomplete data.
   */
  activityPartial: boolean;
  onUpdate: (id: string, patch: Partial<UserRecord>) => void;
  onBulkUpdate: (ids: string[], patch: Partial<UserRecord>) => void;
  onRemove: (ids: string[]) => void;
  onInvite: (
    emails: string[],
    role: string,
    buildingIds: string[],
    message?: string
  ) => void;
  // Phase 4: CSV bulk invite. Each row already has its resolved roleId and
  // buildingIds (from `parseInvitesCsv`). Returns void; the parent surfaces
  // success/error toasts via its own callback.
  onBulkInvite: (intents: InviteIntent[]) => void;
  // Resend an existing invite by email. Parent re-invokes the
  // `createOrganizationInvites` callable with the current role/buildingIds.
  onResendInvite: (user: UserRecord) => void;
  // Trigger a password reset for a user. Parent calls the
  // `resetOrganizationUserPassword` callable (Admin SDK).
  onResetPassword: (user: UserRecord) => void;
}

type StatusFilter = 'all' | UserStatus;
type SortKey =
  | 'name_asc'
  | 'name_desc'
  | 'recently_active'
  | 'recently_invited';

const STATUS_META: Record<UserStatus, { label: string; description: string }> =
  {
    active: {
      label: 'Active',
      description: 'Can sign in and use SpartBoard.',
    },
    invited: {
      label: 'Invited',
      description: 'Invitation sent; awaiting first sign-in.',
    },
    inactive: {
      // Phase 4: 'inactive' removes admin powers via the
      // organizationMembersSync CF (the /admins/{email} doc is deleted) but
      // does NOT block the user from signing in — Firestore rules and
      // AuthContext don't gate on member.status yet. Full sign-in lockout is
      // on the Phase 4.1 backlog. Copy here deliberately says "admin access"
      // rather than "account" so admins don't expect a power they don't have.
      label: 'Inactive',
      description:
        'Revokes admin access. User can still sign in (full lockout coming in a future release).',
    },
  };

type RoleColor = 'indigo' | 'violet' | 'emerald' | 'sky' | 'rose' | 'teal';

const ROLE_COLOR: Record<string, RoleColor> = {
  super_admin: 'rose',
  domain_admin: 'indigo',
  building_admin: 'violet',
  teacher: 'emerald',
  student: 'sky',
};

const ROLE_ICON_CLASSES: Record<RoleColor, string> = {
  indigo: 'bg-indigo-100 text-indigo-700',
  violet: 'bg-violet-100 text-violet-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  sky: 'bg-sky-100 text-sky-700',
  rose: 'bg-rose-100 text-rose-700',
  teal: 'bg-teal-100 text-teal-700',
};

export const UsersView: React.FC<Props> = ({
  users,
  roles,
  buildings,
  actorRole,
  actorBuildingIds,
  activityPartial,
  onUpdate,
  onBulkUpdate,
  onRemove,
  onInvite,
  onBulkInvite,
  onResendInvite,
  onResetPassword,
}) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [buildingFilter, setBuildingFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('name_asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showInvite, setShowInvite] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const editingUser = useMemo(
    () => users.find((u) => u.id === editingUserId) ?? null,
    [users, editingUserId]
  );

  // Filter changes must clear selection, otherwise bulk actions could fire
  // against rows the user can no longer see. Per repo convention (see
  // CLAUDE.md: "Move event-triggered logic into the event handler, not an
  // effect"), the filter setters are wrapped instead of using useEffect.
  const clearSelection = () => setSelected(new Set());
  const changeSearch = (v: string) => {
    setSearch(v);
    clearSelection();
  };
  const changeRoleFilter = (v: string) => {
    setRoleFilter(v);
    clearSelection();
  };
  const changeBuildingFilter = (v: string) => {
    setBuildingFilter(v);
    clearSelection();
  };
  const changeStatusFilter = (v: StatusFilter) => {
    setStatusFilter(v);
    clearSelection();
  };

  const isScoped = actorRole === 'building_admin';
  // In-scope for this actor: row appears, and status is toggleable. Building
  // admins only ever see their own buildings' members (UI) and the Firestore
  // rules enforce the same check server-side.
  const isInScope = (u: UserRecord) =>
    !isScoped || u.buildingIds.some((b) => actorBuildingIds.includes(b));
  // Management actions (role, building assignments, delete, invite) require
  // domain admin or higher. Building admins can only flip status on members
  // within their scope; everything else is read-only for them.
  const canManageUsers = actorRole !== 'building_admin';

  // Building admins should only see (and be able to assign into) the
  // buildings they actually manage. Everyone else sees the whole org list.
  const visibleBuildings = useMemo(
    () =>
      isScoped
        ? buildings.filter((b) => actorBuildingIds.includes(b.id))
        : buildings,
    [buildings, isScoped, actorBuildingIds]
  );

  const filtered = useMemo(() => {
    let list = users;
    if (isScoped) {
      list = list.filter((u) =>
        u.buildingIds.some((b) => actorBuildingIds.includes(b))
      );
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
      );
    }
    if (roleFilter) list = list.filter((u) => u.role === roleFilter);
    if (buildingFilter)
      list = list.filter((u) => u.buildingIds.includes(buildingFilter));
    if (statusFilter !== 'all')
      list = list.filter((u) => u.status === statusFilter);

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'recently_active':
          return (
            (b.lastActive ? Date.parse(b.lastActive) : 0) -
            (a.lastActive ? Date.parse(a.lastActive) : 0)
          );
        case 'recently_invited':
          return (
            (b.invitedAt ? Date.parse(b.invitedAt) : 0) -
            (a.invitedAt ? Date.parse(a.invitedAt) : 0)
          );
      }
    });
    return sorted;
  }, [
    users,
    isScoped,
    actorBuildingIds,
    search,
    roleFilter,
    buildingFilter,
    statusFilter,
    sort,
  ]);

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked =
    filtered.length > 0 && filtered.every((u) => selected.has(u.id));

  return (
    <div>
      <ViewHeader
        title="Users"
        blurb="Invite, assign, and deactivate people across your district."
        actions={
          canManageUsers ? (
            <>
              <Btn
                variant="secondary"
                icon={<Upload size={14} />}
                onClick={() => setShowImport(true)}
              >
                Bulk import
              </Btn>
              <Btn
                variant="primary"
                icon={<Plus size={14} />}
                onClick={() => setShowInvite(true)}
              >
                Invite users
              </Btn>
            </>
          ) : null
        }
      />

      {activityPartial && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <AlertTriangle
            size={16}
            className="mt-0.5 flex-shrink-0 text-amber-600"
          />
          <div>
            <div className="font-medium">Last-active data is incomplete.</div>
            <div className="text-amber-800/90">
              Some members may show &ldquo;Never signed in&rdquo; while actually
              being active. Refresh the page to retry.
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-80">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select
            value={roleFilter}
            onChange={(e) => changeRoleFilter(e.target.value)}
            className="flex-1 sm:w-40"
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select
            value={buildingFilter}
            onChange={(e) => changeBuildingFilter(e.target.value)}
            className="flex-1 sm:w-48"
            aria-label="Filter by building"
          >
            <option value="">All buildings</option>
            {visibleBuildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <Segmented
          value={statusFilter}
          onChange={changeStatusFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'invited', label: 'Invited' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          ariaLabel="Status filter"
        />
        <div className="sm:ml-auto">
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-full sm:w-48"
            aria-label="Sort"
          >
            <option value="name_asc">Name A-Z</option>
            <option value="name_desc">Name Z-A</option>
            <option value="recently_active">Recently active</option>
            <option value="recently_invited">Recently invited</option>
          </Select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-dropdown mb-3 bg-slate-900 text-white rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 shadow-[0_10px_15px_-3px_rgba(29,42,93,.25)]">
          <span className="text-sm font-semibold">
            {selected.size} selected
          </span>
          <span className="h-4 w-px bg-white/20" />
          {canManageUsers && (
            <>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Coming soon"
                className="text-xs font-semibold text-white/50 cursor-not-allowed"
              >
                Resend invite
              </button>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Coming soon"
                className="text-xs font-semibold text-white/50 cursor-not-allowed"
              >
                Change role
              </button>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Coming soon"
                className="text-xs font-semibold text-white/50 cursor-not-allowed"
              >
                Move to building
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              onBulkUpdate(Array.from(selected), { status: 'inactive' });
              setSelected(new Set());
            }}
            className="text-xs font-semibold hover:text-white/80"
          >
            Deactivate
          </button>
          {canManageUsers && (
            <button
              type="button"
              onClick={() => {
                onRemove(Array.from(selected));
                setSelected(new Set());
              }}
              className="text-xs font-semibold text-rose-300 hover:text-rose-200"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto h-7 w-7 rounded-md flex items-center justify-center hover:bg-white/10"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06)] overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[740px]">
            <div className="grid grid-cols-[32px_2.2fr_1.3fr_1.5fr_1fr_1fr_auto] items-center gap-4 px-5 py-3 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <div>
                <Checkbox
                  aria-label="Select all"
                  checked={allChecked}
                  onChange={() => {
                    if (allChecked) setSelected(new Set());
                    else setSelected(new Set(filtered.map((u) => u.id)));
                  }}
                />
              </div>
              <div>Name</div>
              <div>Role</div>
              <div>Buildings</div>
              <div>Status</div>
              <div>Last active</div>
              <div />
            </div>
            {filtered.map((u) => {
              const inScope = isInScope(u);
              return (
                <UserRow
                  key={u.id}
                  user={u}
                  roles={roles}
                  buildings={visibleBuildings}
                  selected={selected.has(u.id)}
                  onToggle={() => toggleRow(u.id)}
                  inScope={inScope}
                  canManage={canManageUsers}
                  onUpdate={(patch) => onUpdate(u.id, patch)}
                  onDelete={() =>
                    canManageUsers && inScope ? onRemove([u.id]) : undefined
                  }
                  onEdit={() => setEditingUserId(u.id)}
                  onResendInvite={() => onResendInvite(u)}
                  onResetPassword={() => onResetPassword(u)}
                />
              );
            })}
            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No users match your filters.
              </div>
            )}
          </div>
        </div>
      </div>

      <InviteModal
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        roles={roles}
        buildings={visibleBuildings}
        onInvite={(emails, role, bids, msg) => {
          onInvite(emails, role, bids, msg);
          setShowInvite(false);
        }}
      />

      <EditUserModal
        isOpen={editingUser !== null}
        existing={editingUser}
        roles={roles}
        buildings={visibleBuildings}
        onClose={() => setEditingUserId(null)}
        onSave={(patch) => {
          if (editingUser) onUpdate(editingUser.id, patch);
          setEditingUserId(null);
        }}
      />

      <BulkImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        roles={roles}
        buildings={visibleBuildings}
        onSubmit={(intents) => {
          onBulkInvite(intents);
          setShowImport(false);
        }}
      />
    </div>
  );
};

// ---------- Row ----------

const UserRow: React.FC<{
  user: UserRecord;
  roles: RoleRecord[];
  buildings: BuildingRecord[];
  selected: boolean;
  onToggle: () => void;
  // Row is within the actor's scope. Status is editable when in scope.
  inScope: boolean;
  // Actor can manage users (role, buildings, delete). False for building_admin.
  canManage: boolean;
  onUpdate: (patch: Partial<UserRecord>) => void;
  onDelete: () => void;
  onEdit: () => void;
  onResendInvite: () => void;
  onResetPassword: () => void;
}> = ({
  user,
  roles,
  buildings,
  selected,
  onToggle,
  inScope,
  canManage,
  onUpdate,
  onDelete,
  onEdit,
  onResendInvite,
  onResetPassword,
}) => {
  // Granular gating: status toggle only needs in-scope; role/buildings/delete
  // additionally require manage privileges (domain admin or higher).
  const canEditStatus = inScope;
  const canEditRole = canManage && inScope;
  const canEditBuildings = canManage && inScope;
  const canDelete = canManage && inScope;
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const [buildingPopoverOpen, setBuildingPopoverOpen] = useState(false);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [bSearch, setBSearch] = useState('');
  const roleTriggerRef = useRef<HTMLButtonElement>(null);
  const buildingTriggerRef = useRef<HTMLButtonElement>(null);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);

  const roleRecord = roles.find((r) => r.id === user.role);
  const userBuildings = user.buildingIds
    .map((id) => buildings.find((b) => b.id === id))
    .filter((b): b is BuildingRecord => Boolean(b));

  return (
    <div
      className={`grid grid-cols-[32px_2.2fr_1.3fr_1.5fr_1fr_1fr_auto] items-center gap-4 px-5 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors ${
        selected ? 'bg-brand-blue-lighter/30' : ''
      } ${!inScope ? 'opacity-60' : ''}`}
    >
      <div>
        <Checkbox
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${user.name}`}
          disabled={!inScope}
        />
      </div>
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={user.name} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {user.name}
          </div>
          <div className="text-xs font-mono text-slate-500 truncate">
            {user.email}
          </div>
        </div>
      </div>

      {/* Role cell */}
      <div className="relative">
        <button
          ref={roleTriggerRef}
          type="button"
          disabled={!canEditRole}
          onClick={() => setRolePopoverOpen((o) => !o)}
          className="inline-flex items-center gap-1 -mx-2 px-2 py-1 rounded-md hover:bg-slate-100 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
          title={!canEditRole ? 'Domain admin only' : undefined}
        >
          {roleRecord ? (
            <Badge color={ROLE_COLOR[roleRecord.id] ?? 'slate'}>
              {roleRecord.name}
            </Badge>
          ) : (
            <span className="text-sm text-slate-500">Unassigned</span>
          )}
        </button>
        <CellPopover
          open={rolePopoverOpen}
          onClose={() => setRolePopoverOpen(false)}
          anchorRef={roleTriggerRef}
        >
          {roles.map((r) => (
            <PopoverOption
              key={r.id}
              onClick={() => {
                onUpdate({ role: r.id });
                setRolePopoverOpen(false);
              }}
              selected={r.id === user.role}
              label={r.name}
              description={r.blurb}
              icon={
                <span
                  className={`h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold ${(() => {
                    const c = ROLE_COLOR[r.id];
                    return c
                      ? ROLE_ICON_CLASSES[c]
                      : 'bg-slate-100 text-slate-700';
                  })()}`}
                >
                  {r.name[0]}
                </span>
              }
            />
          ))}
        </CellPopover>
      </div>

      {/* Buildings cell */}
      <div className="relative">
        <button
          ref={buildingTriggerRef}
          type="button"
          disabled={!canEditBuildings}
          onClick={() => setBuildingPopoverOpen((o) => !o)}
          className="inline-flex flex-wrap items-center gap-1 -mx-2 px-2 py-1 rounded-md hover:bg-slate-100 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30 text-left"
          title={!canEditBuildings ? 'Domain admin only' : undefined}
        >
          {userBuildings.length === 0 ? (
            <span className="text-sm text-slate-400">No buildings</span>
          ) : (
            <>
              {userBuildings.slice(0, 2).map((b) => (
                <Badge key={b.id} color="indigo">
                  {b.name}
                </Badge>
              ))}
              {userBuildings.length > 2 && (
                <span className="text-xs font-semibold text-slate-500">
                  +{userBuildings.length - 2}
                </span>
              )}
            </>
          )}
        </button>
        <CellPopover
          open={buildingPopoverOpen}
          onClose={() => setBuildingPopoverOpen(false)}
          anchorRef={buildingTriggerRef}
          className="min-w-[280px]"
        >
          <div className="p-2">
            <Input
              placeholder="Search buildings"
              value={bSearch}
              onChange={(e) => setBSearch(e.target.value)}
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {buildings
              .filter(
                (b) =>
                  !bSearch ||
                  b.name.toLowerCase().includes(bSearch.toLowerCase())
              )
              .map((b) => {
                const checked = user.buildingIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      const next = checked
                        ? user.buildingIds.filter((id) => id !== b.id)
                        : [...user.buildingIds, b.id];
                      onUpdate({ buildingIds: next });
                    }}
                    className="w-full px-3 py-2 flex items-center gap-2.5 rounded-lg hover:bg-slate-50 text-sm text-left"
                  >
                    <span
                      className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-brand-blue-primary border-brand-blue-primary'
                          : 'border-slate-300'
                      }`}
                    >
                      {checked && <Check size={12} className="text-white" />}
                    </span>
                    <span className="flex-1 text-slate-800">{b.name}</span>
                    <Badge color="slate">{b.grades}</Badge>
                  </button>
                );
              })}
          </div>
        </CellPopover>
      </div>

      {/* Status cell — building admins CAN toggle this for in-scope members. */}
      <div className="relative">
        <button
          ref={statusTriggerRef}
          type="button"
          disabled={!canEditStatus}
          onClick={() => setStatusPopoverOpen((o) => !o)}
          className="-mx-2 px-2 py-1 rounded-md hover:bg-slate-100 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
        >
          <StatusPill status={user.status} />
        </button>
        <CellPopover
          open={statusPopoverOpen}
          onClose={() => setStatusPopoverOpen(false)}
          anchorRef={statusTriggerRef}
        >
          {(['active', 'invited', 'inactive'] as UserStatus[]).map((s) => (
            <PopoverOption
              key={s}
              onClick={() => {
                onUpdate({ status: s });
                setStatusPopoverOpen(false);
              }}
              selected={user.status === s}
              label={STATUS_META[s].label}
              description={STATUS_META[s].description}
              icon={
                <span
                  className={`h-2 w-2 rounded-full mt-1.5 ${
                    s === 'active'
                      ? 'bg-emerald-500'
                      : s === 'invited'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                  }`}
                />
              }
            />
          ))}
        </CellPopover>
      </div>

      <div className="text-sm text-slate-500 font-mono">
        {user.lastActive
          ? new Date(user.lastActive).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })
          : '—'}
      </div>

      <RowMenu
        items={[
          {
            label: 'Edit',
            icon: <Edit3 size={14} />,
            onClick: onEdit,
            disabled: !canManage || !inScope,
          },
          {
            label: 'Resend invite',
            icon: <Mail size={14} />,
            onClick: onResendInvite,
            disabled: !canManage || !inScope || user.status !== 'invited',
          },
          {
            label: 'Reset password',
            icon: <KeyRound size={14} />,
            onClick: onResetPassword,
            disabled: !canManage || !inScope,
          },
          user.status === 'inactive'
            ? {
                label: 'Reactivate',
                icon: <UserCheck size={14} />,
                onClick: () => onUpdate({ status: 'active' }),
                disabled: !canEditStatus,
              }
            : {
                label: 'Deactivate',
                icon: <UserMinus size={14} />,
                onClick: () => onUpdate({ status: 'inactive' }),
                disabled: !canEditStatus,
              },
          {
            label: 'Delete',
            icon: <Trash2 size={14} />,
            onClick: onDelete,
            danger: true,
            disabled: !canDelete,
          },
        ]}
      />
    </div>
  );
};

// ---------- Invite modal ----------

const InviteModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  roles: RoleRecord[];
  buildings: BuildingRecord[];
  onInvite: (
    emails: string[],
    role: string,
    buildingIds: string[],
    message?: string
  ) => void;
}> = ({ isOpen, onClose, roles, buildings, onInvite }) => {
  const [raw, setRaw] = useState('');
  const [role, setRole] = useState(roles[0]?.id ?? 'teacher');
  const [bids, setBids] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const parsed = useMemo(() => {
    const tokens = raw.split(/[\s,;]+/).filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    tokens.forEach((t) => {
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) valid.push(t.toLowerCase());
      else invalid.push(t);
    });
    return { valid: Array.from(new Set(valid)), invalid };
  }, [raw]);

  return (
    <LocalModal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite users"
      icon={<Users size={18} />}
      size="lg"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            disabled={parsed.valid.length === 0}
            onClick={() => onInvite(parsed.valid, role, bids, message)}
          >
            Send {parsed.valid.length || ''} invite
            {parsed.valid.length === 1 ? '' : 's'}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Emails"
          required
          hint="Paste one per line, comma- or space-separated."
        >
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={4}
            placeholder="teacher1@orono.k12.mn.us, teacher2@orono.k12.mn.us"
          />
        </Field>
        {parsed.valid.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {parsed.valid.map((e) => (
              <Badge key={e} color="indigo">
                {e}
              </Badge>
            ))}
          </div>
        )}
        {parsed.invalid.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs font-semibold text-brand-red">
              Invalid:
            </span>
            {parsed.invalid.map((e) => (
              <Badge key={e} color="rose">
                {e}
              </Badge>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Buildings"
            hint={
              buildings.length === 0
                ? 'No buildings yet — add one first.'
                : undefined
            }
          >
            {/* Checkbox list avoids the ctrl/cmd-click discoverability trap
                of a native <select multiple>. Scrollable if many buildings. */}
            <div
              role="group"
              aria-label="Buildings"
              className="max-h-40 overflow-y-auto rounded-lg border border-slate-300 bg-white divide-y divide-slate-100"
            >
              {buildings.map((b) => {
                const checked = bids.includes(b.id);
                const inputId = `invite-building-${b.id}`;
                return (
                  <label
                    key={b.id}
                    htmlFor={inputId}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      onChange={(e) => {
                        setBids((prev) =>
                          e.target.checked
                            ? [...prev, b.id]
                            : prev.filter((id) => id !== b.id)
                        );
                      }}
                    />
                    <span className="flex-1 truncate">{b.name}</span>
                    <Badge color="slate">{b.grades}</Badge>
                  </label>
                );
              })}
            </div>
          </Field>
        </div>
        <Field
          label="Custom message"
          hint="Optional. Shown in the invite email."
        >
          <Textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Welcome to SpartBoard! You'll use this to run classroom boards…"
          />
        </Field>
      </div>
    </LocalModal>
  );
};

// ---------- Bulk import modal (Phase 4) ----------

/**
 * CSV-driven bulk invite. Accepts a file upload or pasted CSV text, runs
 * `parseInvitesCsv` against the current org's roles + buildings, and lets
 * the admin preview valid rows + errors before submitting. Unresolved
 * roles/buildings reject their rows with a per-row error (never a silent
 * drop). On submit, the parent calls `createOrganizationInvites` via the
 * `onBulkInvite` prop.
 */
const BulkImportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  roles: RoleRecord[];
  buildings: BuildingRecord[];
  onSubmit: (intents: InviteIntent[]) => void;
}> = ({ isOpen, onClose, roles, buildings, onSubmit }) => {
  const [csvText, setCsvText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    if (!csvText.trim()) return null;
    return parseInvitesCsv(csvText, {
      roles: roles.map((r) => ({ id: r.id, name: r.name })),
      buildings: buildings.map((b) => ({ id: b.id, name: b.name })),
    });
  }, [csvText, roles, buildings]);

  const reset = () => {
    setCsvText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target?.result;
      setCsvText(typeof raw === 'string' ? raw : '');
    };
    reader.readAsText(file);
  };

  const validCount = parsed?.valid.length ?? 0;
  const errorCount = parsed?.errors.length ?? 0;

  return (
    <LocalModal
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Bulk import users"
      icon={<Upload size={18} />}
      size="lg"
      footer={
        <>
          <Btn
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Btn>
          <Btn
            variant="primary"
            disabled={validCount === 0}
            onClick={() => {
              if (!parsed) return;
              onSubmit(parsed.valid);
              reset();
            }}
          >
            Send {validCount || ''} invite{validCount === 1 ? '' : 's'}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Upload a CSV with columns <code>name</code>, <code>email</code>,{' '}
          <code>role</code>, <code>building</code>. Roles and buildings are
          matched case-insensitively against this organization&apos;s list.
          Invite links are copied to your clipboard — no email is sent.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="flex gap-2">
          <Btn
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} className="mr-1.5" />
            Choose CSV file
          </Btn>
          {csvText && (
            <Btn variant="ghost" onClick={reset}>
              Clear
            </Btn>
          )}
        </div>

        <Field
          label="Or paste CSV here"
          hint="Header row required. Columns in any order."
        >
          <Textarea
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={
              'name,email,role,building\nPaul Ivers,paul@orono.k12.mn.us,teacher,High School'
            }
          />
        </Field>

        {parsed && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-emerald-700 font-semibold">
                {validCount} valid
              </span>
              {errorCount > 0 && (
                <span className="text-rose-700 font-semibold">
                  {errorCount} error{errorCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {validCount > 0 && (
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                {parsed.valid.slice(0, 20).map((v, i) => (
                  <div
                    key={`${v.email}-${i}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-slate-100 last:border-b-0"
                  >
                    <Badge color="emerald">{v.roleId}</Badge>
                    <span className="font-mono text-slate-700">{v.email}</span>
                    <span className="text-slate-400">
                      {v.buildingIds.length} building
                      {v.buildingIds.length === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
                {parsed.valid.length > 20 && (
                  <div className="px-3 py-1.5 text-xs text-slate-500">
                    …and {parsed.valid.length - 20} more.
                  </div>
                )}
              </div>
            )}
            {errorCount > 0 && (
              <div className="border border-rose-200 bg-rose-50 rounded-lg max-h-40 overflow-y-auto">
                {parsed.errors.slice(0, 10).map((e, i) => (
                  <div
                    key={`${e.line}-${i}`}
                    className="px-3 py-1.5 text-xs border-b border-rose-100 last:border-b-0"
                  >
                    <span className="font-mono text-rose-700">
                      line {e.line}
                    </span>
                    <span className="text-slate-700"> — {e.reason}</span>
                  </div>
                ))}
                {parsed.errors.length > 10 && (
                  <div className="px-3 py-1.5 text-xs text-slate-500">
                    …and {parsed.errors.length - 10} more.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </LocalModal>
  );
};

// ---------- Edit user modal ----------

// Pre-populated edit form for an existing member. Submits a patch containing
// only the fields that actually changed; if nothing changed, `onSave` is
// called with an empty patch and `updateMember` no-ops (see useOrgMembers).
const EditUserModal: React.FC<{
  isOpen: boolean;
  existing: UserRecord | null;
  roles: RoleRecord[];
  buildings: BuildingRecord[];
  onClose: () => void;
  onSave: (patch: Partial<UserRecord>) => void;
}> = ({ isOpen, existing, roles, buildings, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [bids, setBids] = useState<string[]>([]);

  // Sync form state when a different user is selected. Per CLAUDE.md, we
  // reset state during render rather than reaching for useEffect.
  const [lastId, setLastId] = useState<string | null>(null);
  if (existing && existing.id !== lastId) {
    setLastId(existing.id);
    setName(existing.name);
    setRole(existing.role);
    setBids(existing.buildingIds);
  }

  if (!existing) return null;

  const buildPatch = (): Partial<UserRecord> => {
    const patch: Partial<UserRecord> = {};
    if (name !== existing.name) patch.name = name;
    if (role !== existing.role) patch.role = role;
    const sameBuildings =
      bids.length === existing.buildingIds.length &&
      bids.every((id) => existing.buildingIds.includes(id));
    if (!sameBuildings) patch.buildingIds = bids;
    return patch;
  };

  return (
    <LocalModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit user"
      icon={<Edit3 size={18} />}
      size="lg"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={() => onSave(buildPatch())}>
            Save changes
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Email">
          <Input value={existing.email} disabled readOnly />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Buildings"
            hint={
              buildings.length === 0 ? 'No buildings available.' : undefined
            }
          >
            <div
              role="group"
              aria-label="Buildings"
              className="max-h-40 overflow-y-auto rounded-lg border border-slate-300 bg-white divide-y divide-slate-100"
            >
              {buildings.map((b) => {
                const checked = bids.includes(b.id);
                const inputId = `edit-building-${b.id}`;
                return (
                  <label
                    key={b.id}
                    htmlFor={inputId}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      onChange={(e) => {
                        setBids((prev) =>
                          e.target.checked
                            ? [...prev, b.id]
                            : prev.filter((id) => id !== b.id)
                        );
                      }}
                    />
                    <span className="flex-1 truncate">{b.name}</span>
                    <Badge color="slate">{b.grades}</Badge>
                  </label>
                );
              })}
            </div>
          </Field>
        </div>
      </div>
    </LocalModal>
  );
};
