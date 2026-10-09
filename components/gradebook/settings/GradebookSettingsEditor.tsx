import React from 'react';
import {
  ChevronDown,
  EyeOff,
  Info,
  Lock,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  DEFAULT_PROFICIENCY_SCALE,
  parseScale,
  storedScale,
  type FlagValueMode,
  type FlagVisibility,
  type GradebookSettingsBody,
  type ProficiencyMethod,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import { flagChipClasses, nextFlagColor } from '@/utils/gradebook/flagColors';
import {
  categoryTotal,
  checkFlagKey,
  clampPct,
  newCategory,
  newFlag,
  restoreDefaultCategories,
} from '@/utils/gradebook/settingsConfig';
import type { GradebookScaleOption } from '@/hooks/useGradebookSettings';
import {
  CommitInput,
  FIELD,
  ICON_BTN,
  LINK_BTN,
  PctInput,
} from './settingsFields';
import { ScaleLevelsEditor } from './ScaleLevelsEditor';

export { FIELD };

export type SettingsChange = (
  next: GradebookSettingsBody,
  undoLabel: string,
  toast?: string
) => void;

interface EditorProps {
  body: GradebookSettingsBody;
  readOnly: boolean;
  scaleOptions: GradebookScaleOption[];
  onChange: SettingsChange;
  /** Refusals such as a bad flag key. */
  onNotice: (message: string) => void;
  /** Lets one shared scale's cutoffs be edited in place (the PLC's own scale in its Gradebook section). */
  sharedScaleEdit?: {
    value: string;
    onCommit: (scale: ProficiencyScale) => void;
  };
}

const VIS_ORDER: FlagVisibility[] = ['off', 'teacher', 'students'];
const VIS: Record<FlagVisibility, { label: string; Icon: typeof EyeOff }> = {
  off: { label: 'Not visible', Icon: EyeOff },
  teacher: { label: 'Teacher only', Icon: User },
  students: { label: 'Teachers and students', Icon: Users },
};

const METHODS: { value: ProficiencyMethod; label: string }[] = [
  { value: 'decaying', label: 'Decaying average (recent counts 65%)' },
  { value: 'mean', label: 'Mean of all evidence' },
  { value: 'recent', label: 'Most recent' },
  { value: 'highest', label: 'Highest' },
];

export const SECTION =
  'bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-[0_1px_2px_rgba(0,0,0,.05)]';
const H3 = 'text-sm font-bold text-slate-800 flex items-center gap-2';

const newId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Native select drawn like the prototype: no system arrow, a slate chevron. */
export const SelectBox: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & { wrapClassName?: string }
> = ({
  className = '',
  wrapClassName = 'flex-1 min-w-0 max-w-[320px]',
  children,
  ...rest
}) => (
  <span className={`relative inline-flex ${wrapClassName}`}>
    <select
      className={`${FIELD} w-full cursor-pointer appearance-none pr-[30px] disabled:cursor-default ${className}`}
      {...rest}
    >
      {children}
    </select>
    <ChevronDown
      size={16}
      aria-hidden
      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
    />
  </span>
);

const LabeledToggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  children: string;
}> = ({ checked, onChange, disabled, children }) => (
  <div className="flex items-center gap-2 text-[13px] text-slate-600">
    <Toggle
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      size="xs"
      showLabels={false}
      label={children}
    />
    <span>{children}</span>
  </div>
);

/** D13, D14 and D17 settings body editor, shared by the teacher modal, PLC and admin surfaces. */
export const GradebookSettingsEditor: React.FC<EditorProps> = ({
  body,
  readOnly,
  scaleOptions,
  onChange,
  onNotice,
  sharedScaleEdit,
}) => {
  const ro = readOnly;
  const set = (
    patch: Partial<GradebookSettingsBody>,
    label: string,
    toast?: string
  ) => onChange({ ...body, ...patch }, label, toast);
  const setFlag = (
    i: number,
    patch: Partial<GradebookSettingsBody['flags'][number]>,
    label: string
  ) =>
    set(
      { flags: body.flags.map((f, n) => (n === i ? { ...f, ...patch } : f)) },
      label
    );
  const setCat = (
    i: number,
    patch: Partial<GradebookSettingsBody['categories'][number]>,
    label: string
  ) =>
    set(
      {
        categories: body.categories.map((c, n) =>
          n === i ? { ...c, ...patch } : c
        ),
      },
      label
    );

  const total = categoryTotal(body.categories);
  const scaleValue =
    body.scale.source === 'plc' ? `plc:${body.scale.plcId}` : body.scale.source;
  const knownScale = scaleOptions.some((o) => o.value === scaleValue);
  const shownScale: ProficiencyScale =
    body.scale.source === 'custom'
      ? (parseScale(body.scale.scale) ?? DEFAULT_PROFICIENCY_SCALE)
      : (scaleOptions.find((o) => o.value === scaleValue)?.scale ??
        DEFAULT_PROFICIENCY_SCALE);
  const scaleEditable = !ro && body.scale.source === 'custom';
  const sharedEditable = !ro && sharedScaleEdit?.value === scaleValue;
  const setCustom = (scale: ProficiencyScale, label: string) =>
    set({ scale: { source: 'custom', scale: storedScale(scale) } }, label);
  const setCutoffs = (scale: ProficiencyScale, label: string) =>
    sharedEditable ? sharedScaleEdit?.onCommit(scale) : setCustom(scale, label);
  const vis = body.studentVisibility;
  const scoresOn = vis.scores && vis.flags && vis.comments;

  return (
    <>
      <section className={SECTION} aria-labelledby="gb-set-flags">
        <h3 id="gb-set-flags" className={H3}>
          Flags
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="border-b border-slate-200 p-2">Flag</th>
                <th className="border-b border-slate-200 p-2 w-[52px]">Key</th>
                <th className="border-b border-slate-200 p-2 w-[188px]">
                  <span className="inline-flex items-center gap-1.5">
                    Value
                    <span className="relative group inline-flex">
                      <button
                        type="button"
                        aria-label="About value"
                        {...tourAttr('gradebook.settings.value-info')}
                        aria-describedby="gb-value-tip"
                        className="inline-flex rounded-full text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                      >
                        <Info size={14} aria-hidden />
                      </button>
                      <span
                        id="gb-value-tip"
                        role="tooltip"
                        className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-56 rounded-lg bg-slate-800 px-2.5 py-2 text-xs font-medium normal-case tracking-normal text-white shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 z-10"
                      >
                        Unscored value. Leave blank for no effect.
                      </span>
                    </span>
                  </span>
                </th>
                <th className="border-b border-slate-200 p-2 w-[112px] leading-tight">
                  Remove when scored
                </th>
                <th className="border-b border-slate-200 p-2 w-[84px]">
                  Visibility
                </th>
                <th className="border-b border-slate-200 p-2 w-[44px]">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {body.flags.map((f, i) => {
                const v = VIS[f.visibility] ?? VIS.teacher;
                return (
                  <tr key={f.id} className="border-b border-slate-100">
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={ro}
                          onClick={() =>
                            setFlag(
                              i,
                              { color: nextFlagColor(f.color) },
                              'Flag color'
                            )
                          }
                          title="Change color"
                          {...tourFieldAttr(
                            'gradebook.settings.flag-color',
                            'gradebook-settings',
                            f.id
                          )}
                          aria-label={`Change ${f.name} color`}
                          className={`h-[22px] min-w-[22px] px-1 rounded text-[11px] font-bold leading-none inline-grid place-items-center shrink-0 disabled:cursor-default ${flagChipClasses(f.color)}`}
                        >
                          {f.key}
                        </button>
                        <CommitInput
                          value={f.name}
                          disabled={ro}
                          maxLength={40}
                          aria-label="Flag name"
                          {...tourFieldAttr(
                            'gradebook.settings.flag-name',
                            'gradebook-settings',
                            f.id
                          )}
                          className="!h-8 w-full min-w-0"
                          onCommit={(raw) => {
                            const name = raw.trim();
                            if (name) setFlag(i, { name }, 'Flag name');
                          }}
                        />
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <CommitInput
                        value={f.key}
                        disabled={ro}
                        maxLength={1}
                        aria-label={`${f.name} key`}
                        {...tourFieldAttr(
                          'gradebook.settings.flag-key',
                          'gradebook-settings',
                          f.id
                        )}
                        className="!h-8 w-10 !px-0 text-center font-semibold uppercase"
                        onCommit={(raw) => {
                          const res = checkFlagKey(raw, body.flags, f.id);
                          if (res.ok) setFlag(i, { key: res.key }, 'Flag key');
                          else onNotice(res.message);
                        }}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      {f.value === 'excluded' ? (
                        <span
                          title="Left out of the average"
                          className="inline-flex h-6 items-center rounded-md bg-slate-100 px-2 text-xs font-semibold text-slate-600"
                        >
                          Excluded
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <SelectBox
                            value={f.mode ?? 'score'}
                            disabled={ro}
                            aria-label={`${f.name} value type`}
                            {...tourFieldAttr(
                              'gradebook.settings.flag-mode',
                              'gradebook-settings',
                              f.id
                            )}
                            wrapClassName="w-[92px] shrink-0"
                            className="!h-8 !pl-2 text-[13px]"
                            onChange={(e) =>
                              setFlag(
                                i,
                                { mode: e.target.value as FlagValueMode },
                                'Flag value type'
                              )
                            }
                          >
                            <option value="score">Score</option>
                            <option value="deduct">Deduct</option>
                          </SelectBox>
                          <PctInput
                            value={f.value}
                            disabled={ro}
                            placeholder="None"
                            compact
                            label={`${f.name} value`}
                            onCommit={(raw) =>
                              setFlag(
                                i,
                                {
                                  value:
                                    raw.trim() === ''
                                      ? null
                                      : clampPct(Number(raw)),
                                },
                                'Flag value'
                              )
                            }
                          />
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={f.removeWhenScored ?? false}
                        disabled={ro}
                        aria-label={`Remove ${f.name} when scored`}
                        {...tourFieldAttr(
                          'gradebook.settings.flag-remove-when-scored',
                          'gradebook-settings',
                          f.id
                        )}
                        className="h-4 w-4 cursor-pointer accent-brand-blue-primary disabled:cursor-default"
                        onChange={(e) =>
                          setFlag(
                            i,
                            { removeWhenScored: e.target.checked },
                            'Remove when scored'
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="relative group inline-flex">
                        <button
                          type="button"
                          disabled={ro}
                          aria-label={`${f.name}: ${v.label}`}
                          {...tourFieldAttr(
                            'gradebook.settings.flag-visibility',
                            'gradebook-settings',
                            f.id
                          )}
                          onClick={() =>
                            setFlag(
                              i,
                              {
                                visibility:
                                  VIS_ORDER[
                                    (VIS_ORDER.indexOf(f.visibility) + 1) %
                                      VIS_ORDER.length
                                  ],
                              },
                              'Flag visibility'
                            )
                          }
                          className={`${ICON_BTN} ${f.visibility === 'students' ? 'bg-brand-blue-lighter !text-brand-blue-primary' : f.visibility === 'off' ? 'text-slate-400' : 'text-slate-600'}`}
                        >
                          <v.Icon size={16} aria-hidden />
                        </button>
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded-lg bg-slate-800 px-2 py-1 text-xs font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 z-10"
                        >
                          {v.label}
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      {ro ? null : f.builtIn ? (
                        <span
                          className={`${ICON_BTN} !text-slate-300 hover:bg-transparent`}
                          title="Built in, used by automatic Late and Missing"
                        >
                          <Lock size={14} aria-hidden />
                        </span>
                      ) : (
                        <button
                          type="button"
                          title="Remove flag"
                          aria-label={`Remove ${f.name}`}
                          {...tourFieldAttr(
                            'gradebook.settings.flag-remove',
                            'gradebook-settings',
                            f.id
                          )}
                          className={`${ICON_BTN} hover:bg-rose-50 hover:!text-brand-red`}
                          onClick={() =>
                            set(
                              { flags: body.flags.filter((_, n) => n !== i) },
                              `Remove ${f.name}`,
                              `Removed ${f.name}`
                            )
                          }
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!ro && body.flags.length < 26 && (
          <div>
            <button
              type="button"
              {...tourAttr('gradebook.settings.flag-add')}
              className={LINK_BTN}
              onClick={() => {
                const f = newFlag(body.flags, newId('f'));
                if (f) set({ flags: [...body.flags, f] }, 'Add flag');
              }}
            >
              + Add flag
            </button>
          </div>
        )}
        <LabeledToggle
          checked={body.autoFlags}
          disabled={ro}
          onChange={(autoFlags) => set({ autoFlags }, 'Automatic flags')}
        >
          Apply Late and Missing automatically from due dates
        </LabeledToggle>
      </section>

      <section className={SECTION} aria-labelledby="gb-set-overall">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 id="gb-set-overall" className={H3}>
            Overall grade
          </h3>
          <div className="flex items-center gap-2 text-[13px] text-slate-600">
            <Toggle
              checked={body.categoriesEnabled}
              onChange={(categoriesEnabled) =>
                set({ categoriesEnabled }, 'Weighted categories')
              }
              disabled={ro}
              size="xs"
              showLabels={false}
              label="Weighted categories"
              anchor={tourAttr('gradebook.settings.categories-toggle')}
            />
            <span>Weighted categories</span>
          </div>
          <span className="flex-1" />
          {!ro && body.categoriesEnabled && (
            <button
              type="button"
              {...tourAttr('gradebook.settings.category-restore')}
              className={LINK_BTN}
              onClick={() =>
                set(
                  { categories: restoreDefaultCategories(body.categories) },
                  'Restore default categories',
                  'Restored default categories'
                )
              }
            >
              Restore defaults
            </button>
          )}
        </div>
        {body.categoriesEnabled ? (
          <>
            <div className="flex flex-col gap-2">
              {body.categories.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2">
                  <CommitInput
                    value={c.name}
                    disabled={ro}
                    maxLength={60}
                    aria-label="Category name"
                    {...tourFieldAttr(
                      'gradebook.settings.category-name',
                      'gradebook-settings',
                      c.id
                    )}
                    className="flex-1 min-w-0"
                    onCommit={(raw) => {
                      const name = raw.trim();
                      if (name) setCat(i, { name }, 'Category name');
                    }}
                  />
                  <PctInput
                    value={c.weight}
                    disabled={ro}
                    label={`${c.name} weight`}
                    onCommit={(raw) =>
                      setCat(
                        i,
                        { weight: clampPct(Number(raw)) },
                        'Category weight'
                      )
                    }
                  />
                  {!ro && (
                    <button
                      type="button"
                      disabled={body.categories.length < 2}
                      title="Remove category"
                      aria-label={`Remove ${c.name}`}
                      {...tourFieldAttr(
                        'gradebook.settings.category-remove',
                        'gradebook-settings',
                        c.id
                      )}
                      className={`${ICON_BTN} hover:bg-rose-50 hover:!text-brand-red`}
                      onClick={() => {
                        const rest = body.categories.filter((_, n) => n !== i);
                        set(
                          { categories: rest },
                          `Remove ${c.name}`,
                          `Removed ${c.name}; its assignments moved to ${rest[0].name}`
                        );
                      }}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {!ro && body.categories.length < 20 && (
                <button
                  type="button"
                  {...tourAttr('gradebook.settings.category-add')}
                  className={LINK_BTN}
                  onClick={() =>
                    set(
                      {
                        categories: [
                          ...body.categories,
                          newCategory(body.categories, newId('c')),
                        ],
                      },
                      'Add category'
                    )
                  }
                >
                  + Add category
                </button>
              )}
              <span className="flex-1" />
              <span
                className={`text-xs ${total > 100 ? 'font-semibold text-brand-red-primary' : 'text-slate-500'}`}
              >
                {total > 100 ? 'Cannot exceed 100%' : `Total ${total}%`}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">
            Overall is total points earned.
          </p>
        )}
      </section>

      <section className={SECTION} aria-labelledby="gb-set-prof">
        <h3 id="gb-set-prof" className={H3}>
          Learning target proficiency
        </h3>
        <div className="flex items-center gap-3">
          <label
            htmlFor="gb-set-scale"
            className="min-w-[130px] text-[13px] font-medium text-slate-600"
          >
            Scale
          </label>
          <SelectBox
            id="gb-set-scale"
            {...tourAttr('gradebook.settings.scale')}
            value={scaleValue}
            disabled={ro}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'custom') setCustom(shownScale, 'Scale');
              else if (v.startsWith('plc:'))
                set({ scale: { source: 'plc', plcId: v.slice(4) } }, 'Scale');
              else set({ scale: { source: 'district' } }, 'Scale');
            }}
          >
            {!knownScale && <option value={scaleValue}>PLC scale</option>}
            {scaleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectBox>
        </div>
        <ScaleLevelsEditor
          scale={shownScale}
          editable={scaleEditable}
          cutoffEditable={(i) =>
            scaleEditable ||
            (sharedEditable && i < Math.min(2, shownScale.levels.length - 1))
          }
          onCommit={(next, label, kind) =>
            kind === 'cutoff' ? setCutoffs(next, label) : setCustom(next, label)
          }
        />
        <div className="flex items-center gap-3">
          <label
            htmlFor="gb-set-method"
            className="min-w-[130px] text-[13px] font-medium text-slate-600"
          >
            Combine evidence
          </label>
          <SelectBox
            id="gb-set-method"
            {...tourAttr('gradebook.settings.combine-evidence')}
            value={body.method}
            disabled={ro}
            onChange={(e) =>
              set(
                { method: e.target.value as ProficiencyMethod },
                'Combine evidence'
              )
            }
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </SelectBox>
        </div>
      </section>

      <section className={SECTION} aria-labelledby="gb-set-students">
        <h3 id="gb-set-students" className={H3}>
          What students see on their Grades tab
        </h3>
        <LabeledToggle
          checked={scoresOn}
          disabled={ro}
          onChange={(on) =>
            set(
              {
                studentVisibility: {
                  ...vis,
                  scores: on,
                  flags: on,
                  comments: on,
                },
              },
              'Student visibility'
            )
          }
        >
          Published scores, visible flags and shared comments
        </LabeledToggle>
        <LabeledToggle
          checked={vis.standards}
          disabled={ro}
          onChange={(standards) =>
            set(
              { studentVisibility: { ...vis, standards } },
              'Student visibility'
            )
          }
        >
          Standards mastery
        </LabeledToggle>
      </section>
    </>
  );
};
