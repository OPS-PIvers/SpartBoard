import React, { useMemo, useState } from 'react';
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

interface Props {
  users: UserRecord[];
  roles: RoleRecord[];
  buildings: BuildingRecord[];
  actorRole: 'super_admin' | 'domain_admin' | 'building_admin';
  actorBuildingIds: string[];
  onUpdate: (id: string, patch: Partial<UserRecord>) => void;
  onBulkUpdate: (ids: string[], patch: Partial<UserRecord>) => void;
  onRemove: (ids: string[]) => void;
  onInvite: (
    emails: string[],
    role: string,
    buildingIds: string[],
    message?: string
  ) => void;
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
      label: 'Inactive',
      description: "Account disabled — can't sign in.",
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
  onUpdate,
  onBulkUpdate,
  onRemove,
  onInvite,
}) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [buildingFilter, setBuildingFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('name_asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showInvite, setShowInvite] = useState(false);
  const [showImport, setShowImport] = useState(false);

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
  const canEditUser = (u: UserRecord) =>
    !isScoped || u.buildingIds.some((b) => actorBuildingIds.includes(b));

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
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-80">
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
        <Select
          value={roleFilter}
          onChange={(e) => changeRoleFilter(e.target.value)}
          className="w-40"
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
          className="w-48"
          aria-label="Filter by building"
        >
          <option value="">All buildings</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
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
        <div className="ml-auto">
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-48"
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
        <div className="sticky top-0 z-dropdown mb-3 bg-slate-900 text-white rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-[0_10px_15px_-3px_rgba(29,42,93,.25)]">
          <span className="text-sm font-semibold">
            {selected.size} selected
          </span>
          <span className="h-4 w-px bg-white/20" />
          <button
            type="button"
            onClick={() =>
              console.warn('[Users] bulk resend', Array.from(selected))
            }
            className="text-xs font-semibold hover:text-white/80"
          >
            Resend invite
          </button>
          <button
            type="button"
            onClick={() =>
              console.warn('[Users] bulk change role', Array.from(selected))
            }
            className="text-xs font-semibold hover:text-white/80"
          >
            Change role
          </button>
          <button
            type="button"
            onClick={() =>
              console.warn('[Users] bulk move', Array.from(selected))
            }
            className="text-xs font-semibold hover:text-white/80"
          >
            Move to building
          </button>
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06)] overflow-visible">
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
          const editable = canEditUser(u);
          return (
            <UserRow
              key={u.id}
              user={u}
              roles={roles}
              buildings={buildings}
              selected={selected.has(u.id)}
              onToggle={() => toggleRow(u.id)}
              editable={editable}
              onUpdate={(patch) => onUpdate(u.id, patch)}
              onDelete={() => onRemove([u.id])}
            />
          );
        })}
        {filtered.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            No users match your filters.
          </div>
        )}
      </div>

      <InviteModal
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        roles={roles}
        buildings={
          isScoped
            ? buildings.filter((b) => actorBuildingIds.includes(b.id))
            : buildings
        }
        onInvite={(emails, role, bids, msg) => {
          onInvite(emails, role, bids, msg);
          setShowInvite(false);
        }}
      />

      <LocalModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Bulk import users"
        icon={<Upload size={18} />}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setShowImport(false)}>
              Close
            </Btn>
            <Btn variant="primary" disabled>
              Upload CSV
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Upload a CSV with columns: <code>name</code>, <code>email</code>,{' '}
            <code>role</code>, <code>building</code>. We&apos;ll send
            invitations automatically.
          </p>
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center text-sm text-slate-500">
            Drop your CSV here, or click to browse.
          </div>
        </div>
      </LocalModal>
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
  editable: boolean;
  onUpdate: (patch: Partial<UserRecord>) => void;
  onDelete: () => void;
}> = ({
  user,
  roles,
  buildings,
  selected,
  onToggle,
  editable,
  onUpdate,
  onDelete,
}) => {
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const [buildingPopoverOpen, setBuildingPopoverOpen] = useState(false);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [bSearch, setBSearch] = useState('');

  const roleRecord = roles.find((r) => r.id === user.role);
  const userBuildings = user.buildingIds
    .map((id) => buildings.find((b) => b.id === id))
    .filter((b): b is BuildingRecord => Boolean(b));

  return (
    <div
      className={`grid grid-cols-[32px_2.2fr_1.3fr_1.5fr_1fr_1fr_auto] items-center gap-4 px-5 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors ${
        selected ? 'bg-brand-blue-lighter/30' : ''
      } ${!editable ? 'opacity-60' : ''}`}
    >
      <div>
        <Checkbox
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${user.name}`}
          disabled={!editable}
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
          type="button"
          disabled={!editable}
          onClick={() => setRolePopoverOpen((o) => !o)}
          className="inline-flex items-center gap-1 -mx-2 px-2 py-1 rounded-md hover:bg-slate-100 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
          title={!editable ? 'Domain admin only' : undefined}
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
          type="button"
          disabled={!editable}
          onClick={() => setBuildingPopoverOpen((o) => !o)}
          className="inline-flex flex-wrap items-center gap-1 -mx-2 px-2 py-1 rounded-md hover:bg-slate-100 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30 text-left"
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

      {/* Status cell */}
      <div className="relative">
        <button
          type="button"
          disabled={!editable}
          onClick={() => setStatusPopoverOpen((o) => !o)}
          className="-mx-2 px-2 py-1 rounded-md hover:bg-slate-100 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
        >
          <StatusPill status={user.status} />
        </button>
        <CellPopover
          open={statusPopoverOpen}
          onClose={() => setStatusPopoverOpen(false)}
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
            onClick: () => console.warn('[Users] edit', user.id),
            disabled: !editable,
          },
          {
            label: 'Resend invite',
            icon: <Mail size={14} />,
            onClick: () => console.warn('[Users] resend', user.id),
            disabled: !editable || user.status !== 'invited',
          },
          {
            label: 'Reset password',
            icon: <KeyRound size={14} />,
            onClick: () => console.warn('[Users] reset password', user.id),
            disabled: !editable,
          },
          user.status === 'inactive'
            ? {
                label: 'Reactivate',
                icon: <UserCheck size={14} />,
                onClick: () => onUpdate({ status: 'active' }),
                disabled: !editable,
              }
            : {
                label: 'Deactivate',
                icon: <UserMinus size={14} />,
                onClick: () => onUpdate({ status: 'inactive' }),
                disabled: !editable,
              },
          {
            label: 'Delete',
            icon: <Trash2 size={14} />,
            onClick: onDelete,
            danger: true,
            disabled: !editable,
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
        <div className="grid grid-cols-2 gap-4">
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
