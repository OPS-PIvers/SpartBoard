// Speak settings in the Flashcards editor (docs/multilingual-pronunciation-engine.md F11, §4.3).
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronRight, Mic } from 'lucide-react';
import type {
  FlashcardSpeakSettings,
  SpeakDialect,
  SpeakGroupSetting,
  SpeakLanguage,
  SpeakPreset,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';
import {
  PRONUNCIATION_GROUPS,
  SPEAK_DIALECTS,
  SPEAK_PRESET_IDS,
} from '@/config/pronunciationGroups';
import {
  SPEAK_ATTEMPTS_MAX,
  SPEAK_ATTEMPTS_MIN,
  clampSpeakAttempts,
} from '@/config/flashcardsSpeakAdmin';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  applySpeakPreset,
  setSpeakGroup,
  setSpeakStrict,
} from './speakEditorState';

interface SpeakSettingsPanelProps {
  language: SpeakLanguage | null;
  settings: FlashcardSpeakSettings | null;
  onChange: (settings: FlashcardSpeakSettings) => void;
}

const LABEL_CLASS = 'font-black uppercase tracking-widest text-slate-500';
const LABEL_STYLE = { fontSize: 'min(10px, 3.2cqmin)' };
const CONTROL_CLASS =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20';
const CONTROL_STYLE = {
  padding: 'min(8px, 2cqmin)',
  fontSize: 'min(13px, 4cqmin)',
};
const GROUP_SETTINGS: readonly SpeakGroupSetting[] = [
  'follow',
  'forgive',
  'require',
];

const DialectPicker: React.FC<{
  labelId: string;
  dialects: readonly SpeakDialect[];
  options: readonly SpeakDialect[];
  onChange: (dialects: SpeakDialect[]) => void;
}> = ({ labelId, dialects, options, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const valueId = useId();
  const name = (dialect: SpeakDialect) =>
    t(`flashcards.speak.editor.dialectNames.${dialect}`);
  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`${CONTROL_CLASS} flex items-center justify-between text-left`}
        style={{ ...CONTROL_STYLE, gap: 'min(6px, 1.5cqmin)' }}
        {...tourTypeAttr('flashcards-speak-editor.dialects', 'flashcards')}
      >
        <span id={valueId} className="truncate">
          {options
            .filter((d) => dialects.includes(d))
            .map(name)
            .join(', ')}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 text-slate-400"
          style={{ width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' }}
        />
      </button>
      {open && (
        <div
          id={menuId}
          role="group"
          aria-labelledby={labelId}
          className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          {options.map((dialect) => {
            const checked = dialects.includes(dialect);
            // The last accent can't be turned off: a set accepts at least one.
            const locked = checked && dialects.length === 1;
            return (
              <button
                key={dialect}
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-disabled={locked}
                onClick={() => {
                  if (locked) return;
                  onChange(
                    checked
                      ? dialects.filter((d) => d !== dialect)
                      : options.filter(
                          (d) => d === dialect || dialects.includes(d)
                        )
                  );
                }}
                className={`flex w-full items-center rounded-lg text-left text-slate-800 hover:bg-slate-50 ${locked ? 'cursor-default' : ''}`}
                style={{ ...CONTROL_STYLE, gap: 'min(8px, 2cqmin)' }}
                {...tourFieldAttr(
                  'flashcards-speak-editor.dialect',
                  'flashcards',
                  dialect
                )}
              >
                <Check
                  aria-hidden="true"
                  className={checked ? 'text-rose-600' : 'invisible'}
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
                {name(dialect)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const SpeakSettingsPanel: React.FC<SpeakSettingsPanelProps> = ({
  language,
  settings,
  onChange,
}) => {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const levelId = useId();
  const dialectsId = useId();
  const attemptsId = useId();
  const groupsId = useId();

  const heading = (
    <div
      className="flex items-center text-slate-900"
      style={{ gap: 'min(6px, 1.5cqmin)' }}
      title={t('flashcards.speak.editor.intro')}
    >
      <Mic
        aria-hidden="true"
        className="text-rose-600"
        style={{ width: 'min(15px, 4.2cqmin)', height: 'min(15px, 4.2cqmin)' }}
      />
      <h3 className="font-black" style={{ fontSize: 'min(13px, 4cqmin)' }}>
        {t('flashcards.speak.editor.title')}
      </h3>
    </div>
  );

  if (!language || !settings) {
    return (
      <div
        className="border-t border-slate-200 [@container(min-width:680px)]:col-span-2"
        style={{ paddingTop: 'min(12px, 3cqmin)' }}
        {...tourTypeAttr('flashcards-speak-editor.panel', 'flashcards')}
      >
        {heading}
        {!language && (
          <p
            className="mt-1 text-slate-600"
            style={{ fontSize: 'min(12px, 3.8cqmin)' }}
          >
            {t('flashcards.speak.editor.unsupportedLanguage')}
          </p>
        )}
      </div>
    );
  }

  const dialectOptions = SPEAK_DIALECTS[language];
  const presets: SpeakPreset[] =
    settings.preset === 'custom'
      ? [...SPEAK_PRESET_IDS, 'custom']
      : [...SPEAK_PRESET_IDS];
  const presetHelp =
    settings.preset === 'custom'
      ? undefined
      : t(`flashcards.speak.editor.presets.${settings.preset}Help`);
  const strictLabel = t('flashcards.speak.editor.strict');
  const exampleLabel = t('flashcards.speak.editor.example');

  return (
    <div
      className="border-t border-slate-200 [@container(min-width:680px)]:col-span-2"
      style={{ paddingTop: 'min(12px, 3cqmin)' }}
      {...tourTypeAttr('flashcards-speak-editor.panel', 'flashcards')}
    >
      {heading}
      <div
        className="mt-2 grid grid-cols-1 [@container(min-width:680px)]:grid-cols-2"
        style={{ gap: 'min(12px, 3cqmin)' }}
      >
        {dialectOptions.length > 1 && (
          <div>
            <span id={dialectsId} className={LABEL_CLASS} style={LABEL_STYLE}>
              {t('flashcards.speak.editor.dialects')}
            </span>
            <DialectPicker
              labelId={dialectsId}
              dialects={settings.dialects}
              options={dialectOptions}
              onChange={(dialects) => onChange({ ...settings, dialects })}
            />
          </div>
        )}
        <div>
          <label htmlFor={levelId} className={LABEL_CLASS} style={LABEL_STYLE}>
            {t('flashcards.speak.editor.level')}
          </label>
          <select
            id={levelId}
            value={settings.preset}
            title={presetHelp}
            onChange={(event) =>
              onChange(
                applySpeakPreset(
                  settings,
                  language,
                  event.target.value as SpeakPreset
                )
              )
            }
            className={CONTROL_CLASS}
            style={CONTROL_STYLE}
            {...tourTypeAttr('flashcards-speak-editor.level', 'flashcards')}
          >
            {presets.map((preset) => (
              <option key={preset} value={preset}>
                {t(`flashcards.speak.editor.presets.${preset}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={attemptsId}
            className={LABEL_CLASS}
            style={LABEL_STYLE}
          >
            {t('flashcards.speak.editor.attempts')}
          </label>
          <input
            id={attemptsId}
            type="number"
            min={SPEAK_ATTEMPTS_MIN}
            max={SPEAK_ATTEMPTS_MAX}
            value={settings.attempts}
            onChange={(event) => {
              const raw = event.target.valueAsNumber;
              if (Number.isFinite(raw)) {
                onChange({
                  ...settings,
                  attempts: clampSpeakAttempts(raw, settings.attempts),
                });
              }
            }}
            className={CONTROL_CLASS}
            style={CONTROL_STYLE}
            {...tourTypeAttr('flashcards-speak-editor.attempts', 'flashcards')}
          />
        </div>
        <div
          className="flex flex-wrap items-center [@container(min-width:680px)]:pt-4"
          style={{ columnGap: 'min(20px, 5cqmin)', rowGap: 'min(8px, 2cqmin)' }}
        >
          <span
            className="inline-flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
            title={t('flashcards.speak.editor.strictHelp')}
          >
            <Toggle
              size="sm"
              showLabels={false}
              activeColor="bg-rose-600"
              label={strictLabel}
              checked={settings.strict}
              onChange={(strict) => onChange(setSpeakStrict(settings, strict))}
              anchor={tourTypeAttr(
                'flashcards-speak-editor.strict',
                'flashcards'
              )}
            />
            <span
              className="font-bold text-slate-700"
              style={{ fontSize: 'min(12px, 3.8cqmin)' }}
            >
              {strictLabel}
            </span>
          </span>
          <span
            className="inline-flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
            title={t('flashcards.speak.editor.exampleHelp')}
          >
            <Toggle
              size="sm"
              showLabels={false}
              activeColor="bg-rose-600"
              label={exampleLabel}
              checked={settings.example}
              onChange={(example) => onChange({ ...settings, example })}
              anchor={tourTypeAttr(
                'flashcards-speak-editor.example',
                'flashcards'
              )}
            />
            <span
              className="font-bold text-slate-700"
              style={{ fontSize: 'min(12px, 3.8cqmin)' }}
            >
              {exampleLabel}
            </span>
          </span>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={advancedOpen}
        aria-controls={groupsId}
        onClick={() => setAdvancedOpen((open) => !open)}
        className="mt-3 inline-flex items-center rounded-lg font-bold text-slate-600 hover:text-slate-900"
        style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(12px, 3.8cqmin)' }}
        {...tourTypeAttr('flashcards-speak-editor.advanced', 'flashcards')}
      >
        {advancedOpen ? (
          <ChevronDown
            aria-hidden="true"
            style={{ width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' }}
          />
        ) : (
          <ChevronRight
            aria-hidden="true"
            style={{ width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' }}
          />
        )}
        {t('flashcards.speak.editor.advancedSettings')}
      </button>

      {advancedOpen && (
        <div id={groupsId} className="mt-2">
          <span className={LABEL_CLASS} style={LABEL_STYLE}>
            {t('flashcards.speak.editor.groupsTitle')}
          </span>
          <ul className="mt-1 divide-y divide-slate-100">
            {PRONUNCIATION_GROUPS[language].map((group) => {
              const label = t(`flashcards.speak.groups.${group.id}`);
              return (
                <li
                  key={group.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center"
                  style={{
                    gap: 'min(10px, 2.5cqmin)',
                    padding: 'min(6px, 1.5cqmin) 0',
                  }}
                >
                  <span
                    className="min-w-0 text-slate-800"
                    style={{ fontSize: 'min(12px, 3.8cqmin)' }}
                    title={t(`flashcards.speak.groupHints.${group.id}`)}
                  >
                    {label}
                  </span>
                  <select
                    aria-label={label}
                    value={settings.groups[group.id] ?? 'follow'}
                    onChange={(event) =>
                      onChange(
                        setSpeakGroup(
                          settings,
                          group.id,
                          event.target.value as SpeakGroupSetting
                        )
                      )
                    }
                    className="rounded-lg border border-slate-200 bg-white text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
                    style={{
                      padding: 'min(5px, 1.3cqmin) min(6px, 1.5cqmin)',
                      fontSize: 'min(12px, 3.8cqmin)',
                    }}
                    {...tourFieldAttr(
                      'flashcards-speak-editor.group',
                      'flashcards',
                      group.id
                    )}
                  >
                    {GROUP_SETTINGS.map((value) => (
                      <option key={value} value={value}>
                        {t(`flashcards.speak.editor.groupSetting.${value}`)}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
