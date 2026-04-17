import React, { useState } from 'react';
import { LayoutGrid, Sparkles, Package, Archive } from 'lucide-react';
import type { OrgRecord, Plan } from '../types';
import {
  Card,
  Field,
  Input,
  Toggle,
  ViewHeader,
  Btn,
  Badge,
  Confirm,
} from '../components/primitives';

const PLAN_META: Record<
  Plan,
  { label: string; blurb: string; widgets: number }
> = {
  basic: {
    label: 'Basic Pack',
    blurb: 'Core classroom widgets — clock, schedule, announcements.',
    widgets: 8,
  },
  expanded: {
    label: 'Expanded Pack',
    blurb: 'Basic + interactive tools (polls, drawing, seating, number line).',
    widgets: 22,
  },
  full: {
    label: 'Full Suite',
    blurb: 'Everything, including AI-powered widgets.',
    widgets: 34,
  },
};

interface Props {
  org: OrgRecord;
  isSuperAdmin: boolean;
  onUpdate: (patch: Partial<OrgRecord>) => void;
  onArchive: (orgId: string) => void;
}

export const OverviewView: React.FC<Props> = ({
  org,
  isSuperAdmin,
  onUpdate,
  onArchive,
}) => {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const aiGated = org.plan !== 'full';

  return (
    <div>
      <ViewHeader
        title={org.name}
        blurb="Organization settings. Affects every user, building, and board in your district."
      />

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-5">
        <Card ruled className="pt-5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <LayoutGrid size={16} className="text-brand-blue-dark" />
            <h3 className="text-sm font-bold text-slate-900">General</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Organization name">
              <Input
                value={org.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
              />
            </Field>
            <Field label="Short name" hint="Used in emails and the sidebar">
              <Input
                value={org.shortName}
                onChange={(e) => onUpdate({ shortName: e.target.value })}
              />
            </Field>
            <Field label="Short code" hint="2-4 letters, used in avatars">
              <Input
                value={org.shortCode}
                onChange={(e) =>
                  onUpdate({
                    shortCode: e.target.value.toUpperCase().slice(0, 4),
                  })
                }
              />
            </Field>
            <Field label="State">
              <Input
                value={org.state}
                onChange={(e) => onUpdate({ state: e.target.value })}
              />
            </Field>
            <div className="md:col-span-2">
              <Field
                label="Primary admin"
                hint="Billing contact and top-level owner of this org"
              >
                <Input
                  value={org.primaryAdminEmail}
                  onChange={(e) =>
                    onUpdate({ primaryAdminEmail: e.target.value })
                  }
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card ruled className="pt-5 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brand-blue-dark" />
              <h3 className="text-sm font-bold text-slate-900">AI features</h3>
            </div>
            <Badge color="rose">Super admin only</Badge>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-800">
                AI features {org.aiEnabled ? 'on' : 'off'}
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Enables Catalyst, Guided Learning, Concept Web, and other AI
                widgets.
              </p>
            </div>
            <Toggle
              checked={org.aiEnabled}
              onChange={(v) => onUpdate({ aiEnabled: v })}
              disabled={!isSuperAdmin || aiGated}
              ariaLabel="Enable AI features"
            />
          </div>
          {!isSuperAdmin && (
            <p className="text-xs text-slate-500 mt-4 leading-relaxed border-t border-slate-100 pt-4">
              AI access is managed by SpartBoard. Contact your customer success
              manager or{' '}
              <a
                href="mailto:support@spartboard.app"
                className="text-brand-blue-primary font-semibold hover:underline"
              >
                support@spartboard.app
              </a>{' '}
              to change.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card ruled className="pt-5 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-brand-blue-dark" />
              <h3 className="text-sm font-bold text-slate-900">
                Widget access pack
              </h3>
              <Badge color="rose" className="ml-1">
                Super admin only
              </Badge>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Your plan is set by SpartBoard. Contact{' '}
            <a
              href="mailto:support@spartboard.app"
              className="text-brand-blue-primary font-semibold hover:underline"
            >
              support@spartboard.app
            </a>{' '}
            to upgrade or change packs.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['basic', 'expanded', 'full'] as Plan[]).map((plan) => {
              const meta = PLAN_META[plan];
              const selected = org.plan === plan;
              return (
                <div
                  key={plan}
                  className={`rounded-xl border p-4 transition ${
                    selected
                      ? 'border-brand-blue-primary ring-1 ring-brand-blue-primary/30 bg-white'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className={`text-sm font-bold ${
                        selected ? 'text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      {meta.label}
                    </div>
                    {selected && <Badge color="indigo">Current plan</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed min-h-[40px]">
                    {meta.blurb}
                  </p>
                  <div
                    className={`text-xs font-semibold mt-3 font-mono ${
                      selected ? 'text-slate-700' : 'text-slate-400'
                    }`}
                  >
                    {meta.widgets} widgets included
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <Card ruled ruledColor="red" className="pt-5 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Archive size={16} className="text-brand-red" />
                <h3 className="text-sm font-bold text-slate-900">
                  Danger zone
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Archive this organization. Users will be signed out and boards
                will be frozen.
              </p>
            </div>
            <Btn
              variant="dangerGhost"
              onClick={() => setConfirmArchive(true)}
              disabled={!isSuperAdmin}
            >
              Archive organization
            </Btn>
          </div>
        </Card>
      </div>

      <Confirm
        isOpen={confirmArchive}
        title="Archive organization"
        message={
          <>
            This will deactivate <strong>{org.name}</strong>. All users will be
            signed out and boards frozen. Type the district code to confirm.
          </>
        }
        requireTyping={org.shortCode}
        confirmLabel="Archive"
        destructive
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          setConfirmArchive(false);
          onArchive(org.id);
        }}
      />
    </div>
  );
};
