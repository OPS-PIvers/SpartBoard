import React, { useState } from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { Btn } from '@/components/admin/Organization/components/primitives';
import { Toggle } from '@/components/common/Toggle';
import {
  GradebookSettingsEditor,
  SECTION,
} from '@/components/gradebook/settings/GradebookSettingsEditor';
import { ChecklistSelect } from '@/components/gradebook/settings/ChecklistSelect';
import type { UndoEntry } from '@/components/gradebook/settings/useUndoToast';
import type { GradebookScaleOption } from '@/hooks/useGradebookSettings';
import { canonicalizeBuildingIds } from '@/config/buildings';
import type { GradebookSettingsBody } from '@/utils/gradebook/gradebookCore';
import {
  cloneSettingsBody,
  defaultSettingsBody,
  defaultsToClear,
  type DistrictConfig,
} from '@/utils/gradebook/settingsConfig';

type Saved = Omit<DistrictConfig, 'id'>;

export interface DistrictConfigsCardProps {
  configs: DistrictConfig[];
  buildings: { id: string; name: string }[];
  scaleOptions: GradebookScaleOption[];
  newId: () => string;
  onSave: (id: string, config: Saved) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  notify: (message: string, undo?: UndoEntry) => void;
  fail: (err: unknown) => void;
}

const FIELD =
  'h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30';
const ICON_BTN =
  'h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30';
const ROW_LABEL = 'min-w-[130px] text-sm font-medium text-slate-600';

const savedOf = (c: DistrictConfig): Saved => ({
  body: cloneSettingsBody(c.body),
  buildingIds: [...c.buildingIds],
  isDefault: c.isDefault,
});

/** D16 district configurations: the teacher settings editor, named and targeted to buildings. */
export const DistrictConfigsCard: React.FC<DistrictConfigsCardProps> = ({
  configs,
  buildings,
  scaleOptions,
  newId,
  onSave,
  onDelete,
  notify,
  fail,
}) => {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const shown = configs.find((c) => c.id === pickedId) ?? configs[0] ?? null;

  const save = (c: DistrictConfig, next: Saved, message: string) => {
    const prev = savedOf(c);
    onSave(c.id, next).catch(fail);
    notify(message, { run: () => onSave(c.id, prev) });
  };

  /** Writes `next`, dropping the default from any config it now overlaps. */
  const saveWithDefault = (c: DistrictConfig, next: Saved, message: string) => {
    const cleared = next.isDefault
      ? defaultsToClear(configs, c.id, next.buildingIds)
      : [];
    const prev = savedOf(c);
    onSave(c.id, next).catch(fail);
    cleared.forEach((o) =>
      onSave(o.id, { ...savedOf(o), isDefault: false }).catch(fail)
    );
    notify(message, {
      run: async () => {
        await onSave(c.id, prev);
        await Promise.all(cleared.map((o) => onSave(o.id, savedOf(o))));
      },
    });
  };

  const create = (body: GradebookSettingsBody, message: string) => {
    const id = newId();
    onSave(id, { body, buildingIds: [], isDefault: false }).catch(fail);
    setPickedId(id);
    setRenaming(true);
    setConfirmDelete(false);
    notify(message, { run: () => onDelete(id) });
  };

  const remove = (c: DistrictConfig) => {
    const prev = savedOf(c);
    setConfirmDelete(false);
    setPickedId(configs.find((o) => o.id !== c.id)?.id ?? null);
    onDelete(c.id).catch(fail);
    notify(`Deleted ${c.body.name}`, { run: () => onSave(c.id, prev) });
  };

  const newButton = (
    <Btn
      {...tourAttr('admin.gradebook-settings.new-configuration')}
      size="sm"
      onClick={() =>
        create(
          defaultSettingsBody('New configuration'),
          'Created configuration'
        )
      }
    >
      + New
    </Btn>
  );

  if (!shown) {
    return (
      <section className={SECTION} aria-labelledby="gb-admin-district">
        <div className="flex items-center gap-2">
          <h3
            id="gb-admin-district"
            className="text-sm font-bold text-slate-800"
          >
            District configurations
          </h3>
          <span className="flex-1" />
          {newButton}
        </div>
        <p className="text-sm text-slate-500">No district configurations</p>
      </section>
    );
  }

  const onBuildings = canonicalizeBuildingIds(shown.buildingIds);

  return (
    <>
      <section
        className={`${SECTION} gap-3.5`}
        aria-labelledby="gb-admin-district"
      >
        <h3 id="gb-admin-district" className="text-sm font-bold text-slate-800">
          District configurations
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="gb-admin-cfg" className={ROW_LABEL}>
            Configuration
          </label>
          {renaming ? (
            <input
              {...tourAttr('admin.gradebook-settings.configuration-name')}
              id="gb-admin-cfg"
              autoFocus
              defaultValue={shown.body.name}
              maxLength={80}
              aria-label="Configuration name"
              className={`${FIELD} flex-1 min-w-0 max-w-[320px]`}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                setRenaming(false);
                const name = e.currentTarget.value.trim().slice(0, 80);
                if (!name || name === shown.body.name) return;
                save(
                  shown,
                  { ...savedOf(shown), body: { ...shown.body, name } },
                  `Renamed to ${name}`
                );
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <select
              {...tourAttr('admin.gradebook-settings.configuration-select')}
              id="gb-admin-cfg"
              value={shown.id}
              className={`${FIELD} flex-1 min-w-0 max-w-[320px]`}
              onChange={(e) => {
                setPickedId(e.target.value);
                setConfirmDelete(false);
              }}
            >
              {configs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.body.name}
                </option>
              ))}
            </select>
          )}
          <span className="flex gap-0.5">
            <button
              {...tourAttr('admin.gradebook-settings.rename-configuration')}
              type="button"
              className={ICON_BTN}
              title="Rename"
              aria-label="Rename configuration"
              onClick={() => setRenaming(true)}
            >
              <Pencil size={15} aria-hidden />
            </button>
            <button
              {...tourAttr('admin.gradebook-settings.duplicate-configuration')}
              type="button"
              className={ICON_BTN}
              title="Duplicate"
              aria-label="Duplicate configuration"
              onClick={() =>
                create(
                  {
                    ...cloneSettingsBody(shown.body),
                    name: `${shown.body.name} copy`.slice(0, 80),
                  },
                  'Duplicated configuration'
                )
              }
            >
              <Copy size={15} aria-hidden />
            </button>
            <button
              {...tourAttr('admin.gradebook-settings.delete-configuration')}
              type="button"
              className={`${ICON_BTN} hover:text-brand-red-primary`}
              title="Delete"
              aria-label="Delete configuration"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </span>
          {newButton}
        </div>

        {confirmDelete && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
            <span className="flex-1">
              Delete <b>{shown.body.name}</b>? Classes on it go back to the
              default settings.
            </span>
            <Btn
              {...tourAttr(
                'admin.gradebook-settings.confirm-delete-configuration'
              )}
              variant="danger"
              size="sm"
              onClick={() => remove(shown)}
            >
              Delete
            </Btn>
            <Btn
              {...tourAttr(
                'admin.gradebook-settings.cancel-remove-configuration'
              )}
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Btn>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <span className={ROW_LABEL}>Buildings</span>
          <ChecklistSelect
            anchor={tourAttr('admin.gradebook-settings.district-buildings')}
            label="Buildings"
            emptyText="No buildings"
            className="flex-1 max-w-[320px]"
            options={buildings.map((b) => ({ id: b.id, label: b.name }))}
            selected={onBuildings}
            onToggle={(id, on) => {
              const name =
                buildings.find((b) => b.id === id)?.name ?? 'Building';
              saveWithDefault(
                shown,
                {
                  ...savedOf(shown),
                  buildingIds: on
                    ? [...onBuildings, id]
                    : onBuildings.filter((b) => b !== id),
                },
                on
                  ? `${name} teachers now see ${shown.body.name}`
                  : `${name} teachers no longer see ${shown.body.name}`
              );
            }}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className={ROW_LABEL} id="gb-admin-default">
            Default for new classes
          </span>
          <Toggle
            anchor={tourAttr('admin.gradebook-settings.default-configuration')}
            checked={shown.isDefault}
            onChange={(isDefault) =>
              saveWithDefault(
                shown,
                { ...savedOf(shown), isDefault },
                isDefault
                  ? `New classes in these buildings start on ${shown.body.name}`
                  : `${shown.body.name} is no longer a default`
              )
            }
            size="xs"
            showLabels={false}
            label="Default for new classes"
          />
        </div>
      </section>

      <GradebookSettingsEditor
        key={shown.id}
        body={shown.body}
        readOnly={false}
        scaleOptions={scaleOptions}
        onChange={(body, label, message) =>
          save(
            shown,
            { ...savedOf(shown), body },
            message ?? `Changed: ${label}`
          )
        }
        onNotice={(m) => notify(m)}
      />
    </>
  );
};
