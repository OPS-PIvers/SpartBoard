import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import type { OrgRecord } from '@/components/admin/Organization/types';
import {
  Btn,
  Card,
  Field,
  Input,
} from '@/components/admin/Organization/components/primitives';
import { Toggle } from '@/components/common/Toggle';
import { isValidManagedAuthIssuer } from '@/config/claudeManagedAuth';

interface Props {
  org: OrgRecord;
  canEdit: boolean;
  onUpdate: (patch: Partial<OrgRecord>) => void;
}

/** Enterprise Managed Auth: the issuer Claude signs this org's staff in with, so they skip the Connect step. */
export const ClaudeSignInCard: React.FC<Props> = ({
  org,
  canEdit,
  onUpdate,
}) => {
  const saved = org.claudeManagedAuth ?? { enabled: false, issuer: '' };
  const [enabled, setEnabled] = useState(saved.enabled);
  const [issuer, setIssuer] = useState(saved.issuer);
  const trimmed = issuer.trim();
  const issuerOk = trimmed === '' || isValidManagedAuthIssuer(trimmed);
  const dirty = enabled !== saved.enabled || trimmed !== saved.issuer;
  const canSave = canEdit && dirty && issuerOk && (!enabled || trimmed !== '');

  return (
    <Card ruled className="pt-5 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <KeyRound size={16} className="text-brand-blue-dark" />
          <h3 className="text-sm font-bold text-slate-900">Claude sign-in</h3>
        </div>
        <Toggle
          anchor={tourAttr('admin.org.overview-claude-sign-in-toggle')}
          checked={enabled}
          onChange={setEnabled}
          disabled={!canEdit}
          label="Sign staff in to the Claude connector automatically"
          showLabels={false}
        />
      </div>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        Staff in your Claude organization connect to SpartBoard without the
        Connect step. Copy the Issuer URL from Claude&apos;s managed
        authorization setup for the SpartBoard connector.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Issuer URL"
          hint={issuerOk ? 'Starts with https://' : 'Enter an https:// URL'}
        >
          <Input
            {...tourAttr('admin.org.overview-claude-sign-in-issuer')}
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="https://identity.anthropic.com/issuers/..."
            disabled={!canEdit}
          />
        </Field>
        <Field
          label="Tenant ID"
          hint="Optional in Claude's setup; enter it there to pick this organization"
        >
          {/* no-tour-anchor: read-only value, nothing to walk a teacher to */}
          <Input value={org.id} readOnly disabled />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Btn
          {...tourAttr('admin.org.overview-claude-sign-in-save')}
          onClick={() =>
            onUpdate({ claudeManagedAuth: { enabled, issuer: trimmed } })
          }
          disabled={!canSave}
        >
          Save
        </Btn>
      </div>
    </Card>
  );
};
