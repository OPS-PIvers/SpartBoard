import React, { useMemo, useState } from 'react';
import type { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useOrganization } from '@/hooks/useOrganization';
import { usePlcGradebookSettings } from '@/hooks/usePlcGradebookSettings';
import {
  useGradebookSettings,
  type GradebookScaleOption,
} from '@/hooks/useGradebookSettings';
import { isPlcLeadOrCoLead } from '@/utils/plc';
import { Btn } from '@/components/admin/Organization/components/primitives';
import { GradebookSettingsEditor } from '@/components/gradebook/settings/GradebookSettingsEditor';
import { ChecklistSelect } from '@/components/gradebook/settings/ChecklistSelect';
import { useUndoToast } from '@/components/gradebook/settings/useUndoToast';
import type {
  GradebookSettingsBody,
  ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import {
  applyToastText,
  cloneSettingsBody,
  defaultSettingsBody,
  gradebookClassOptions,
} from '@/utils/gradebook/settingsConfig';

/** Members link their own classes to the PLC set (D16 "Use in my gradebook"). */
const UseInMyGradebook: React.FC<{
  plcId: string;
  notify: ReturnType<typeof useUndoToast>['notify'];
  fail: (err: unknown) => void;
}> = ({ plcId, notify, fail }) => {
  const { rosters } = useDashboard();
  const s = useGradebookSettings();
  const classes = useMemo(() => gradebookClassOptions(rosters), [rosters]);
  const key = `plc:${plcId}`;
  const target = s.entries.find((e) => e.key === key);
  if (!target) return null;
  const selected = classes
    .filter((c) => s.configForClass(c.id).key === key)
    .map((c) => c.id);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-[130px] text-sm font-medium text-slate-600">
        Use in my gradebook
      </span>
      <ChecklistSelect
        label="Use in my gradebook"
        emptyText="No classes"
        className="flex-1 max-w-[320px]"
        disabled={s.loading}
        options={classes.map((c) => {
          const cur = s.configForClass(c.id);
          return {
            id: c.id,
            label: c.name,
            note: cur.source === 'builtin' ? undefined : cur.name,
          };
        })}
        selected={selected}
        onToggle={(id, on) => {
          const cls = classes.find((c) => c.id === id);
          if (!cls) return;
          const previous = s.configForClass(id);
          s.setClassConfig(id, on ? target.ref : null).catch(fail);
          notify(applyToastText(cls.name, target, previous, on), {
            run: () => s.setClassConfig(id, previous.ref),
          });
        }}
      />
    </div>
  );
};

export interface PlcGradebookSectionViewProps {
  plcId: string;
  plcName: string;
  canEdit: boolean;
  loading: boolean;
  body: GradebookSettingsBody | null;
  cutoffs: { proficient: number; approaching: number } | null;
  districtScale: ProficiencyScale;
  orgName: string | undefined;
  save: (body: GradebookSettingsBody) => Promise<void>;
  remove: () => Promise<void>;
  saveCutoffs: (c: {
    proficient: number;
    approaching: number;
  }) => Promise<void>;
  notify: ReturnType<typeof useUndoToast>['notify'];
  fail: (err: unknown) => void;
  /** The member's class picker, shown once the set exists. */
  children?: React.ReactNode;
}

/** Presentational PLC Gradebook subsection; `PlcGradebookSection` wires it to Firestore. */
export const PlcGradebookSectionView: React.FC<
  PlcGradebookSectionViewProps
> = ({
  plcId,
  plcName,
  canEdit,
  loading,
  body,
  cutoffs,
  districtScale,
  orgName,
  save,
  remove,
  saveCutoffs,
  notify,
  fail,
  children,
}) => {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const plcScaleValue = `plc:${plcId}`;
  const scaleOptions: GradebookScaleOption[] = [
    {
      value: 'district',
      label: orgName ? `${orgName} district scale` : 'District scale',
      scale: districtScale,
    },
    {
      value: plcScaleValue,
      label: `${plcName} scale`,
      scale: cutoffs ? { ...districtScale, ...cutoffs } : districtScale,
    },
    { value: 'custom', label: 'Custom', scale: null },
  ];

  const create = () => {
    save({
      ...defaultSettingsBody(plcName),
      scale: { source: 'plc', plcId },
    }).catch(fail);
    notify('Shared gradebook settings with the PLC', { run: remove });
  };

  const stopSharing = () => {
    if (!body) return;
    const prev = cloneSettingsBody(body);
    setConfirmRemove(false);
    remove().catch(fail);
    notify('Stopped sharing gradebook settings', { run: () => save(prev) });
  };

  return (
    <div className="border-t border-slate-200 pt-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-800">Gradebook</h3>
        <span className="flex-1" />
        {canEdit && !loading && body && (
          <Btn size="sm" onClick={() => setConfirmRemove(true)}>
            Stop sharing
          </Btn>
        )}
      </div>

      {confirmRemove && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
          <span className="flex-1">
            Members&apos; classes on these settings go back to the default
            settings.
          </span>
          <Btn variant="danger" size="sm" onClick={stopSharing}>
            Stop sharing
          </Btn>
          <Btn size="sm" onClick={() => setConfirmRemove(false)}>
            Cancel
          </Btn>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !body ? (
        canEdit ? (
          <div>
            <Btn variant="primary" size="sm" onClick={create}>
              Share gradebook settings
            </Btn>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Your PLC lead hasn&apos;t shared gradebook settings.
          </p>
        )
      ) : (
        <>
          {children}
          <GradebookSettingsEditor
            body={body}
            readOnly={!canEdit}
            scaleOptions={scaleOptions}
            onChange={(next, label, message) => {
              const prev = cloneSettingsBody(body);
              save(next).catch(fail);
              notify(message ?? `Changed: ${label}`, { run: () => save(prev) });
            }}
            onNotice={(m) => notify(m)}
            sharedScaleEdit={{
              value: plcScaleValue,
              onCommit: (scale) => {
                const prev = cutoffs ?? {
                  proficient: districtScale.proficient,
                  approaching: districtScale.approaching,
                };
                saveCutoffs(scale).catch(fail);
                notify('Changed the PLC cutoffs', {
                  run: () => saveCutoffs(prev),
                });
              },
            }}
          />
        </>
      )}
    </div>
  );
};

/** PLC Settings > Gradebook: the shared configuration leads edit and members apply (D16). */
export const PlcGradebookSection: React.FC<{ plc: Plc }> = ({ plc }) => {
  const { user, orgId } = useAuth();
  const { organization } = useOrganization(orgId);
  const g = usePlcGradebookSettings(plc.id, plc.name);
  const { notify, fail, toastNode } = useUndoToast('PlcGradebook');
  return (
    <>
      <PlcGradebookSectionView
        plcId={plc.id}
        plcName={plc.name}
        canEdit={!!user && isPlcLeadOrCoLead(plc, user.uid)}
        loading={g.loading}
        body={g.body}
        cutoffs={g.cutoffs}
        districtScale={g.districtScale}
        orgName={organization?.name?.trim()}
        save={g.save}
        remove={g.remove}
        saveCutoffs={g.saveCutoffs}
        notify={notify}
        fail={fail}
      >
        <UseInMyGradebook plcId={plc.id} notify={notify} fail={fail} />
      </PlcGradebookSectionView>
      {toastNode}
    </>
  );
};
