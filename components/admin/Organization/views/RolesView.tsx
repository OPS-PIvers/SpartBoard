import React, { useRef, useState } from 'react';
import {
  Shield,
  Plus,
  Lock,
  Check,
  RotateCcw,
  Copy,
  Home as HomeIcon,
} from 'lucide-react';
import type { CapabilityAccess, RoleId, RoleRecord } from '../types';
import { CAPABILITY_GROUPS } from '../mockData';
import {
  Badge,
  Btn,
  CellPopover,
  PopoverOption,
  ViewHeader,
  Field,
  Input,
  LocalModal,
  Textarea,
  Confirm,
} from '../components/primitives';

interface Props {
  roles: RoleRecord[];
  onSave: (roles: RoleRecord[]) => void;
  onReset: () => void;
}

const ACCESS_META: Record<
  CapabilityAccess,
  { label: string; description: string; color: string }
> = {
  full: {
    label: 'Full access',
    description: 'Allowed across the entire organization.',
    color: 'emerald',
  },
  building: {
    label: 'Own building only',
    description: "Scoped to the user's assigned building(s).",
    color: 'amber',
  },
  none: {
    label: 'No access',
    description: 'Hidden from this role.',
    color: 'slate',
  },
};

export const RolesView: React.FC<Props> = ({ roles, onSave, onReset }) => {
  const [working, setWorking] = useState<RoleRecord[]>(roles);
  const [activeRoleId, setActiveRoleId] = useState<RoleId>(
    roles[0]?.id ?? 'domain_admin'
  );
  const [creating, setCreating] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const cloneCounter = useRef(1);

  const [prevRolesRef, setPrevRolesRef] = useState(roles);
  if (roles !== prevRolesRef) {
    setPrevRolesRef(roles);
    setWorking(roles);
  }

  const dirty = JSON.stringify(working) !== JSON.stringify(roles);
  const activeRole = working.find((r) => r.id === activeRoleId) ?? working[0];

  const setCellValue = (roleId: RoleId, capId: string, v: CapabilityAccess) => {
    setWorking((prev) =>
      prev.map((r) =>
        r.id === roleId ? { ...r, perms: { ...r.perms, [capId]: v } } : r
      )
    );
  };

  const cloneRole = (roleId: RoleId) => {
    const src = working.find((r) => r.id === roleId);
    if (!src) return;
    const newId = `${src.id}_copy_${cloneCounter.current++}`;
    const clone: RoleRecord = {
      ...src,
      id: newId,
      name: `${src.name} (copy)`,
      system: false,
    };
    setWorking((prev) => [...prev, clone]);
    setActiveRoleId(newId);
  };

  return (
    <div>
      <ViewHeader
        title="Roles & permissions"
        blurb="Define what each role can do. Click any cell to pick Full, Own-building, or No access."
        actions={
          <>
            <Btn
              variant="secondary"
              icon={<RotateCcw size={14} />}
              onClick={() => setConfirmReset(true)}
            >
              Reset to defaults
            </Btn>
            <Btn
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setCreating(true)}
            >
              New role
            </Btn>
          </>
        }
      />

      <div className="flex items-center gap-4 mb-4 text-xs text-slate-600">
        <Legend color="bg-emerald-500" label="Full access" />
        <Legend color="bg-amber-500" label="Scoped to own building" />
        <Legend color="bg-slate-300" label="No access" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
        <aside className="space-y-2">
          {working.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setActiveRoleId(role.id)}
              className={`w-full text-left rounded-xl border bg-white p-4 transition-colors ${
                activeRoleId === role.id
                  ? 'border-brand-blue-primary ring-1 ring-brand-blue-primary/30'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <RoleDot color={role.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {role.name}
                    </div>
                    {role.system && (
                      <Lock size={12} className="text-slate-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {role.blurb}
                  </p>
                  {role.system && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cloneRole(role.id);
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue-primary hover:underline"
                    >
                      <Copy size={12} /> Clone to customize
                    </button>
                  )}
                </div>
              </div>
            </button>
          ))}
        </aside>

        <section className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06)] overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 min-w-[320px]">
                    Capability
                  </th>
                  <th className="text-center px-4 py-3 min-w-[180px]">
                    <RoleHeader role={activeRole} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITY_GROUPS.map((group) => (
                  <React.Fragment key={group.id}>
                    <tr>
                      <td
                        colSpan={2}
                        className="px-5 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50/50"
                      >
                        {group.label}
                      </td>
                    </tr>
                    {group.capabilities.map((cap) => (
                      <tr
                        key={cap.id}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-5 py-3 text-slate-800">
                          {cap.label}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <MatrixCell
                            value={activeRole.perms[cap.id] ?? 'none'}
                            onChange={(v) =>
                              setCellValue(activeRole.id, cap.id, v)
                            }
                            readOnly={activeRole.system}
                          />
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {dirty && (
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(29,42,93,.06)]">
              <div className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Unsaved changes
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="ghost" onClick={() => setWorking(roles)}>
                  Discard
                </Btn>
                <Btn variant="primary" onClick={() => onSave(working)}>
                  Save changes
                </Btn>
              </div>
            </div>
          )}
        </section>
      </div>

      <CreateRoleModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onCreate={(r) => {
          const id = `custom_${Date.now()}`;
          setWorking((prev) => [
            ...prev,
            {
              id,
              name: r.name,
              blurb: r.blurb,
              color: 'teal',
              system: false,
              perms: Object.fromEntries(
                CAPABILITY_GROUPS.flatMap((g) => g.capabilities).map((c) => [
                  c.id,
                  'none' as CapabilityAccess,
                ])
              ),
            },
          ]);
          setActiveRoleId(id);
          setCreating(false);
        }}
      />

      <Confirm
        isOpen={confirmReset}
        title="Reset roles to defaults?"
        message="This will restore the 5 system roles to their default permissions and remove any custom roles you've added."
        confirmLabel="Reset"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          onReset();
        }}
      />
    </div>
  );
};

const Legend: React.FC<{ color: string; label: string }> = ({
  color,
  label,
}) => (
  <span className="inline-flex items-center gap-2">
    <span className={`h-3 w-3 rounded-sm ${color}`} aria-hidden />
    {label}
  </span>
);

const RoleDot: React.FC<{ color: string }> = ({ color }) => {
  const map: Record<string, string> = {
    rose: 'bg-rose-100 text-rose-700 border-rose-200',
    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    violet: 'bg-violet-100 text-violet-700 border-violet-200',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    sky: 'bg-sky-100 text-sky-700 border-sky-200',
    teal: 'bg-teal-100 text-teal-700 border-teal-200',
  };
  return (
    <div
      className={`h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 ${
        map[color] ?? map.indigo
      }`}
    >
      <Shield size={16} />
    </div>
  );
};

const RoleHeader: React.FC<{ role: RoleRecord }> = ({ role }) => (
  <div className="inline-flex flex-col items-center gap-1">
    <RoleDot color={role.color} />
    <div className="text-sm font-bold text-slate-900">{role.name}</div>
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      {role.system ? 'System' : 'Custom'}
    </div>
  </div>
);

const MatrixCell: React.FC<{
  value: CapabilityAccess;
  onChange: (v: CapabilityAccess) => void;
  readOnly?: boolean;
}> = ({ value, onChange, readOnly }) => {
  const [open, setOpen] = useState(false);

  const content = (() => {
    if (value === 'full')
      return (
        <div className="h-8 w-8 rounded-md bg-emerald-500 text-white flex items-center justify-center mx-auto">
          <Check size={16} />
        </div>
      );
    if (value === 'building')
      return (
        <div className="h-8 w-8 rounded-md bg-amber-400 text-white flex items-center justify-center mx-auto">
          <HomeIcon size={14} />
        </div>
      );
    return (
      <div className="h-8 w-8 rounded-md border-2 border-dashed border-slate-300 mx-auto" />
    );
  })();

  if (readOnly) {
    return (
      <div
        className="relative inline-block"
        title="System role — clone to customize."
      >
        {content}
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Access: ${ACCESS_META[value].label}`}
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded-md hover:bg-slate-100 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
      >
        {content}
      </button>
      <CellPopover open={open} onClose={() => setOpen(false)}>
        {(['full', 'building', 'none'] as CapabilityAccess[]).map((v) => (
          <PopoverOption
            key={v}
            onClick={() => {
              onChange(v);
              setOpen(false);
            }}
            selected={value === v}
            label={ACCESS_META[v].label}
            description={ACCESS_META[v].description}
            icon={<AccessIcon value={v} />}
          />
        ))}
      </CellPopover>
    </div>
  );
};

const AccessIcon: React.FC<{ value: CapabilityAccess }> = ({ value }) => {
  if (value === 'full')
    return (
      <div className="h-5 w-5 rounded bg-emerald-500 text-white flex items-center justify-center">
        <Check size={12} />
      </div>
    );
  if (value === 'building')
    return (
      <div className="h-5 w-5 rounded bg-amber-400 text-white flex items-center justify-center">
        <HomeIcon size={12} />
      </div>
    );
  return (
    <div className="h-5 w-5 rounded border-2 border-dashed border-slate-300" />
  );
};

const CreateRoleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreate: (r: { name: string; blurb: string }) => void;
}> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [blurb, setBlurb] = useState('');

  return (
    <LocalModal
      isOpen={isOpen}
      onClose={onClose}
      title="New role"
      icon={<Shield size={18} />}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            disabled={!name}
            onClick={() => onCreate({ name, blurb })}
          >
            Create role
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Role name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Curriculum coach"
            autoFocus
          />
        </Field>
        <Field
          label="Description"
          hint="Shown under the role name — one short sentence."
        >
          <Textarea
            rows={3}
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="Supports teachers with board templates and can view analytics."
          />
        </Field>
        <div className="p-3 rounded-lg bg-brand-blue-lighter/50 border border-brand-blue-lighter text-xs text-slate-700">
          <Badge color="indigo">Tip</Badge>
          <span className="ml-2">
            New roles start with <strong>No access</strong> everywhere. Grant
            capabilities from the matrix once the role is created.
          </span>
        </div>
      </div>
    </LocalModal>
  );
};
