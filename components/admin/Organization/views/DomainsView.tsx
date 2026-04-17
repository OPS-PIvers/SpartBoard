import React, { useState } from 'react';
import {
  Globe,
  Plus,
  Mail,
  CheckCircle,
  GraduationCap,
  Users,
  Info,
} from 'lucide-react';
import type { AuthMethod, DomainRecord } from '../types';
import {
  Badge,
  Btn,
  EmptyState,
  Field,
  Input,
  RowMenu,
  Select,
  StatusPill,
  ViewHeader,
  LocalModal,
} from '../components/primitives';

const AUTH_LABEL: Record<AuthMethod, string> = {
  google: 'Google SSO',
  microsoft: 'Microsoft SSO',
  saml: 'SAML',
  password: 'Password',
  email: 'Email link',
};

const AUTH_ICON: Record<AuthMethod, React.ReactNode> = {
  google: (
    <span
      className="h-4 w-4 rounded bg-gradient-to-br from-red-400 via-yellow-400 to-green-500"
      aria-hidden
    />
  ),
  microsoft: (
    <span
      className="h-4 w-4 rounded bg-gradient-to-br from-sky-500 to-amber-500"
      aria-hidden
    />
  ),
  saml: <Globe size={16} className="text-slate-500" aria-hidden />,
  password: <Globe size={16} className="text-slate-500" aria-hidden />,
  email: <Mail size={16} className="text-slate-500" aria-hidden />,
};

const DOMAIN_ROLE_META = {
  primary: { color: 'indigo', label: 'Primary' },
  staff: { color: 'slate', label: 'Staff' },
  student: { color: 'sky', label: 'Student' },
} as const;

interface Props {
  domains: DomainRecord[];
  onAdd: (domain: Partial<DomainRecord>) => void;
  onRemove: (id: string) => void;
}

export const DomainsView: React.FC<Props> = ({ domains, onAdd, onRemove }) => {
  const [showAdd, setShowAdd] = useState(false);
  const verified = domains.filter((d) => d.status === 'verified');
  const methods = Array.from(new Set(domains.map((d) => d.authMethod)));
  const totalUsers = domains.reduce((a, d) => a + d.users, 0);

  return (
    <div>
      <ViewHeader
        title="Sign-in domains"
        blurb="Control which email domains can sign in to this organization, and how they authenticate. Firebase auth is scoped by org — domains listed here can log in; others cannot."
        actions={
          <Btn
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => setShowAdd(true)}
          >
            Add domain
          </Btn>
        }
      />

      {domains.length === 0 ? (
        <EmptyState
          icon={<Globe size={26} />}
          title="No sign-in domains yet"
          message="Add at least one email domain so teachers in your district can sign in."
          cta={
            <Btn
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setShowAdd(true)}
            >
              Add domain
            </Btn>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <Stat
              icon={<Globe size={14} />}
              label="Verified domains"
              value={`${verified.length}`}
            />
            <Stat
              icon={<CheckCircle size={14} />}
              label="Methods in use"
              value={
                <span className="flex flex-wrap gap-1 mt-1">
                  {methods.map((m) => (
                    <Badge key={m} color="indigo">
                      {AUTH_LABEL[m]}
                    </Badge>
                  ))}
                </span>
              }
            />
            <Stat
              icon={<Users size={14} />}
              label="Users across domains"
              value={totalUsers.toLocaleString()}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06),0_1px_3px_rgba(29,42,93,.08)] overflow-hidden">
            <div className="grid grid-cols-[2fr_1.2fr_0.9fr_0.6fr_0.9fr_auto] gap-4 px-5 py-3 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <div>Domain</div>
              <div>Auth method</div>
              <div>Status</div>
              <div className="text-right">Users</div>
              <div>Added</div>
              <div />
            </div>
            {domains.map((d) => {
              const roleMeta = DOMAIN_ROLE_META[d.role];
              return (
                <div
                  key={d.id}
                  className="grid grid-cols-[2fr_1.2fr_0.9fr_0.6fr_0.9fr_auto] items-center gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        d.role === 'student'
                          ? 'bg-sky-50 text-sky-600'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {d.role === 'student' ? (
                        <GraduationCap size={16} />
                      ) : (
                        <Globe size={16} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-mono text-slate-800 truncate">
                        {d.domain}
                      </div>
                      <div className="mt-0.5">
                        <Badge color={roleMeta.color}>{roleMeta.label}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    {AUTH_ICON[d.authMethod]}
                    {AUTH_LABEL[d.authMethod]}
                  </div>
                  <div>
                    <StatusPill status={d.status} />
                  </div>
                  <div className="text-right text-sm font-mono text-slate-700">
                    {d.users.toLocaleString()}
                  </div>
                  <div className="text-sm font-mono text-slate-500">
                    {d.addedAt}
                  </div>
                  <RowMenu
                    items={[
                      {
                        label: 'Edit',
                        onClick: () => console.warn('[Domains] edit', d.id),
                      },
                      {
                        label: 'Set as primary',
                        onClick: () =>
                          console.warn('[Domains] set primary', d.id),
                        disabled: d.role === 'primary',
                      },
                      {
                        label: 'Resend verification',
                        onClick: () => console.warn('[Domains] resend', d.id),
                        disabled: d.status !== 'pending',
                      },
                      {
                        label: 'Remove',
                        onClick: () => onRemove(d.id),
                        danger: true,
                      },
                    ]}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-4 rounded-xl bg-brand-blue-lighter/50 border border-brand-blue-lighter text-sm text-slate-700 flex items-start gap-3">
            <Info
              size={16}
              className="text-brand-blue-primary shrink-0 mt-0.5"
              aria-hidden
            />
            <div>
              <strong className="font-semibold text-slate-900">
                How this connects to Firebase.
              </strong>{' '}
              When you add a domain, SpartBoard creates a Firebase Auth tenant
              filter so only matching emails can sign in. Super admins can
              assign new domains to any org — once verified, users signing in
              with that email land in the correct organization automatically.
            </div>
          </div>
        </>
      )}

      <AddDomainModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={(d) => {
          onAdd(d);
          setShowAdd(false);
        }}
      />
    </div>
  );
};

const Stat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_1px_2px_rgba(29,42,93,.06)]">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      <span className="text-slate-400">{icon}</span>
      {label}
    </div>
    <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
  </div>
);

const AddDomainModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onAdd: (d: Partial<DomainRecord>) => void;
}> = ({ isOpen, onClose, onAdd }) => {
  const [domain, setDomain] = useState('');
  const [method, setMethod] = useState<AuthMethod>('google');
  const [samlUrl, setSamlUrl] = useState('');

  return (
    <LocalModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add sign-in domain"
      icon={<Globe size={18} />}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            disabled={!domain}
            onClick={() =>
              onAdd({
                domain: domain.startsWith('@') ? domain : `@${domain}`,
                authMethod: method,
                status: 'pending',
                role: 'staff',
                users: 0,
                addedAt: new Date().toISOString().slice(0, 10),
              })
            }
          >
            Send verification
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Domain"
          required
          hint="Example: orono.k12.mn.us"
          htmlFor="add-domain-input"
        >
          <div className="flex items-center rounded-lg border border-slate-300 focus-within:border-brand-blue-primary focus-within:ring-[3px] focus-within:ring-brand-blue-primary/30 bg-white">
            <span className="pl-3 text-slate-400 font-mono text-sm">@</span>
            <input
              id="add-domain-input"
              value={domain.replace(/^@/, '')}
              onChange={(e) => setDomain(e.target.value)}
              className="flex-1 h-10 px-2 bg-transparent outline-none font-mono text-sm text-slate-800"
              placeholder="orono.k12.mn.us"
              autoFocus
            />
          </div>
        </Field>
        <Field label="Auth method">
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as AuthMethod)}
          >
            <option value="google">Google SSO</option>
            <option value="microsoft">Microsoft SSO</option>
            <option value="saml">SAML</option>
            <option value="password">Password</option>
            <option value="email">Email link</option>
          </Select>
        </Field>
        {method === 'saml' && (
          <Field label="IdP metadata URL">
            <Input
              value={samlUrl}
              onChange={(e) => setSamlUrl(e.target.value)}
              placeholder="https://idp.district.org/metadata.xml"
            />
          </Field>
        )}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
          After you save, we&apos;ll show a DNS TXT record to copy into your DNS
          provider. Verification usually takes under 10 minutes.
        </div>
      </div>
    </LocalModal>
  );
};
