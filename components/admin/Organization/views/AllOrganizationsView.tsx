import React, { useState } from 'react';
import { Download, Plus, Search } from 'lucide-react';
import type { OrgRecord, Plan } from '../types';
import {
  Badge,
  Btn,
  Input,
  OrgLogoTile,
  RowMenu,
  Segmented,
  StatusPill,
  ViewHeader,
  LocalModal,
  Field,
  Select,
} from '../components/primitives';

const PLAN_LABEL: Record<Plan, string> = {
  basic: 'Basic Pack',
  expanded: 'Expanded Pack',
  full: 'Full Suite',
};

interface Props {
  orgs: OrgRecord[];
  onOpen: (orgId: string) => void;
  onCreate: (org: Partial<OrgRecord>) => void;
}

type StatusFilter = 'all' | 'active' | 'trial';

export const AllOrganizationsView: React.FC<Props> = ({
  orgs,
  onOpen,
  onCreate,
}) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = orgs.filter((o) => {
    const matchSearch =
      !search ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.shortCode.toLowerCase().includes(search.toLowerCase());
    const matchStatus = status === 'all' ? true : o.status === status;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      <ViewHeader
        title="Organizations"
        blurb="Create and manage districts on SpartBoard. Each organization has its own buildings, users, domains, and widget access."
        actions={
          <>
            <Btn
              variant="secondary"
              icon={<Download size={14} />}
              onClick={() =>
                console.warn('[AllOrganizations] export requested')
              }
            >
              Export list
            </Btn>
            <Btn
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setShowCreate(true)}
            >
              New organization
            </Btn>
          </>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organizations..."
            className="pl-9"
            aria-label="Search organizations"
          />
        </div>
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'trial', label: 'Trial' },
          ]}
          ariaLabel="Status filter"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06),0_1px_3px_rgba(29,42,93,.08)] overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_0.75fr_0.75fr_0.75fr_1.5fr_0.9fr_auto] items-center gap-4 px-5 py-3 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <div>Organization</div>
          <div>Plan</div>
          <div>AI</div>
          <div className="text-right">Users</div>
          <div className="text-right">Buildings</div>
          <div>Primary admin</div>
          <div>Status</div>
          <div />
        </div>
        {filtered.map((org) => (
          <div
            key={org.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(org.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(org.id);
              }
            }}
            className="w-full grid grid-cols-[2fr_1fr_0.75fr_0.75fr_0.75fr_1.5fr_0.9fr_auto] items-center gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <OrgLogoTile
                shortCode={org.shortCode}
                seedColor={org.seedColor}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {org.name}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {org.state} · created {org.createdAt}
                </div>
              </div>
            </div>
            <div>
              <Badge
                color={
                  org.plan === 'full'
                    ? 'indigo'
                    : org.plan === 'expanded'
                      ? 'cyan'
                      : 'slate'
                }
              >
                {PLAN_LABEL[org.plan]}
              </Badge>
            </div>
            <div>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                  org.aiEnabled ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    org.aiEnabled ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                  aria-hidden
                />
                {org.aiEnabled ? 'On' : 'Off'}
              </span>
            </div>
            <div className="text-right text-sm font-mono text-slate-700">
              {org.users}
            </div>
            <div className="text-right text-sm font-mono text-slate-700">
              {org.buildings}
            </div>
            <div className="text-sm text-slate-700 font-mono truncate">
              {org.primaryAdminEmail}
            </div>
            <div>
              <StatusPill
                status={org.status === 'archived' ? 'inactive' : org.status}
              />
            </div>
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="none"
            >
              <RowMenu
                items={[
                  { label: 'Open', onClick: () => onOpen(org.id) },
                  {
                    label: 'Edit details',
                    onClick: () => onOpen(org.id),
                  },
                  {
                    label: 'Archive',
                    onClick: () =>
                      console.warn('[AllOrganizations] archive', org.id),
                    danger: true,
                  },
                ]}
              />
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            No organizations match your filters.
          </div>
        )}
      </div>

      <CreateOrgModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(o) => {
          onCreate(o);
          setShowCreate(false);
        }}
      />
    </div>
  );
};

const CreateOrgModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreate: (o: Partial<OrgRecord>) => void;
}> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [plan, setPlan] = useState<Plan>('basic');
  const [email, setEmail] = useState('');

  const slug = (s: string) => {
    // shortCode is shown as the org avatar — clamp to the 2-4 char window the
    // field hint advertises, padding with 'X' if the name had fewer than two
    // letters so we never emit a 0/1-char code that breaks the avatar tile.
    const letters = s.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const clamped = letters.slice(0, 4);
    return clamped.length >= 2 ? clamped : (clamped + 'XX').slice(0, 2);
  };

  return (
    <LocalModal
      isOpen={isOpen}
      onClose={onClose}
      title="New organization"
      icon={<Plus size={18} />}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            onClick={() =>
              onCreate({
                name,
                shortCode: shortCode || slug(name),
                plan,
                primaryAdminEmail: email,
              })
            }
            disabled={!name || !email}
          >
            Create
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Organization name" required>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!shortCode) setShortCode(slug(e.target.value));
            }}
            placeholder="Orono Public Schools"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Short code" hint="2-4 letters, used in avatars">
            <Input
              value={shortCode}
              onChange={(e) =>
                setShortCode(e.target.value.toUpperCase().slice(0, 4))
              }
            />
          </Field>
          <Field label="Plan">
            <Select
              value={plan}
              onChange={(e) => setPlan(e.target.value as Plan)}
            >
              <option value="basic">Basic Pack</option>
              <option value="expanded">Expanded Pack</option>
              <option value="full">Full Suite</option>
            </Select>
          </Field>
        </div>
        <Field label="Primary admin email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@district.org"
          />
        </Field>
      </div>
    </LocalModal>
  );
};
