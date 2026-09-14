// Admin config for the Quiz widget: the raise-hand gate plus the languages panel.
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Hand, Save, Loader2, Languages, Settings2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { BuildingSelector } from './BuildingSelector';
import { DockDefaultsPanel } from './DockDefaultsPanel';
import { QuizReadAloudConfigurationPanel } from './QuizReadAloudConfigurationPanel';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { canonicalBuildingId } from '@/config/buildings';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import type {
  FeaturePermission,
  QuizBuildingConfig,
  QuizGlobalConfig,
} from '@/types';
import {
  DEFAULT_QUIZ_HAND_RAISE_MODE,
  QUIZ_HAND_RAISE_MODES,
  type QuizHandRaiseMode,
} from '@/utils/quizHandRaise';

interface QuizConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  permission: FeaturePermission;
  onSave: (
    updates: Partial<FeaturePermission>
  ) => void | boolean | Promise<void | boolean>;
}

// Spread the stored config so sibling keys (notably `dockDefaults`, which
// AuthContext reads as an access gate) survive a save from this modal.
const normalizeConfig = (raw: unknown): QuizGlobalConfig => {
  const config = raw as QuizGlobalConfig | undefined;
  return { ...config, buildingDefaults: config?.buildingDefaults ?? {} };
};

export const QuizConfigurationModal: React.FC<QuizConfigurationModalProps> = ({
  isOpen,
  onClose,
  permission,
  onSave,
}) => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const BUILDINGS = useAdminBuildings();
  const [tab, setTab] = useState<'behavior' | 'languages'>('behavior');
  const [saving, setSaving] = useState(false);
  const [languagesDirty, setLanguagesDirty] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);
  const [config, setConfig] = useState<QuizGlobalConfig>(() =>
    normalizeConfig(permission.config)
  );

  const [prevConfig, setPrevConfig] = useState(permission.config);
  if (permission.config !== prevConfig) {
    setPrevConfig(permission.config);
    setConfig(normalizeConfig(permission.config));
  }

  // useAdminBuildings() can hand back a legacy long-form id, so read and write
  // buildingDefaults under the canonical id like every other building reader.
  const canonicalId = selectedBuildingId
    ? canonicalBuildingId(selectedBuildingId)
    : '';
  const hasBuilding = canonicalId !== '';

  const currentBuildingConfig: QuizBuildingConfig = useMemo(
    () => (canonicalId ? (config.buildingDefaults?.[canonicalId] ?? {}) : {}),
    [config.buildingDefaults, canonicalId]
  );

  const handRaiseMode =
    currentBuildingConfig.handRaiseMode ?? DEFAULT_QUIZ_HAND_RAISE_MODE;

  const updateBuilding = (updates: Partial<QuizBuildingConfig>) => {
    if (!canonicalId) return;
    setConfig((prev) => ({
      ...prev,
      buildingDefaults: {
        ...prev.buildingDefaults,
        [canonicalId]: { ...currentBuildingConfig, ...updates },
      },
    }));
  };

  const isDirty =
    JSON.stringify(config) !==
      JSON.stringify(normalizeConfig(permission.config)) || languagesDirty;

  // Same discard prompt the generic admin config modal path uses.
  const requestClose = async () => {
    if (isDirty) {
      const confirmed = await showConfirm(
        t(
          'quizAdmin.discardMessage',
          'You have unsaved changes. Are you sure you want to discard them?'
        ),
        {
          title: t('quizAdmin.discardTitle', 'Discard Changes'),
          variant: 'warning',
          confirmLabel: t('quizAdmin.discardConfirm', 'Discard'),
        }
      );
      if (!confirmed) return;
    }
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await onSave({
        config: config as unknown as Record<string, unknown>,
      });
      if (result === false) {
        addToast(
          t('quizAdmin.saveFailed', 'Failed to save quiz configuration.'),
          'error'
        );
        return;
      }
      addToast(t('quizAdmin.saved', 'Quiz configuration saved.'), 'success');
      onClose();
    } catch (err) {
      console.error('Failed to save quiz config:', err);
      addToast(
        t('quizAdmin.saveFailed', 'Failed to save quiz configuration.'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const MODE_COPY: Record<QuizHandRaiseMode, { label: string; hint: string }> =
    {
      'teacher-choice': {
        label: t('quizAdmin.handRaise.teacherChoice', "Teacher's choice"),
        hint: t(
          'quizAdmin.handRaise.teacherChoiceHint',
          'Each teacher decides per quiz. Off unless they turn it on.'
        ),
      },
      'force-on': {
        label: t('quizAdmin.handRaise.forceOn', 'Always on'),
        hint: t(
          'quizAdmin.handRaise.forceOnHint',
          'Raise hand is available in every quiz and teachers cannot turn it off.'
        ),
      },
      'force-off': {
        label: t('quizAdmin.handRaise.forceOff', 'Always off'),
        hint: t(
          'quizAdmin.handRaise.forceOffHint',
          'Raise hand is hidden from students in every quiz.'
        ),
      },
    };

  const header = (
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-brand-blue-lighter rounded-xl text-brand-blue-primary">
          <Hand className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">
            {t('quizAdmin.title', 'Quiz Administration')}
          </h2>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            {t('quizAdmin.subtitle', 'Raise hand & languages')}
          </p>
        </div>
      </div>
      <button
        onClick={() => void requestClose()}
        aria-label={t('quizAdmin.close', 'Close')}
        className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between w-full">
      <p className="text-xxs text-slate-400 font-bold uppercase tracking-widest">
        {tab === 'behavior'
          ? `${t('quizAdmin.building', 'Building')}: ${
              BUILDINGS.find((b) => b.id === selectedBuildingId)?.name ?? '—'
            }`
          : ''}
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => void requestClose()}
          className="px-6 py-2.5 rounded-2xl text-sm font-black text-slate-500 hover:bg-white transition-all border border-transparent hover:border-slate-200"
        >
          {t('quizAdmin.cancel', 'Cancel')}
        </button>
        {/* The Languages tab owns its own Save; a footer save here would discard its draft. */}
        {tab === 'behavior' && (
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-8 py-2.5 bg-brand-blue-primary text-white rounded-2xl text-sm font-black shadow-lg hover:bg-brand-blue-dark transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t('quizAdmin.save', 'Save Configuration')}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => void requestClose()}
      maxWidth="max-w-5xl"
      customHeader={header}
      footer={footer}
      className="!p-0"
      contentClassName=""
      footerClassName="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between w-full shrink-0"
    >
      <div className="p-6 space-y-6">
        <div className="flex gap-2">
          {(
            [
              {
                id: 'behavior' as const,
                label: t('quizAdmin.tabs.behavior', 'Behavior'),
                icon: Settings2,
              },
              {
                id: 'languages' as const,
                label: t('quizAdmin.tabs.languages', 'Languages'),
                icon: Languages,
              },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-colors flex items-center gap-2 ${
                tab === id
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-brand-blue-light'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <section className="space-y-4" hidden={tab !== 'behavior'}>
          <DockDefaultsPanel
            config={{ dockDefaults: config.dockDefaults ?? {} }}
            onChange={(dockDefaults) =>
              setConfig((prev) => ({ ...prev, dockDefaults }))
            }
          />
          {!hasBuilding ? (
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 text-center">
              <p className="text-sm font-semibold text-slate-700">
                {t('quizAdmin.noBuildings', 'No buildings configured')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {t(
                  'quizAdmin.noBuildingsHint',
                  'Add a building under Organization before setting a raise-hand default.'
                )}
              </p>
            </div>
          ) : (
            <>
              <div>
                <SettingsLabel as="span" icon={Settings2}>
                  {t(
                    'quizAdmin.selectBuilding',
                    'Select building to configure'
                  )}
                </SettingsLabel>
                <BuildingSelector
                  selectedId={selectedBuildingId}
                  onSelect={setSelectedBuildingId}
                />
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                  <Hand className="w-4 h-4 text-brand-blue-primary" />
                  {t('quizAdmin.handRaise.heading', 'Raise hand')}
                </h4>
                <p className="text-xs text-slate-500">
                  {t(
                    'quizAdmin.handRaise.help',
                    'Controls whether students see a Raise hand button while taking a quiz in this building.'
                  )}
                </p>
                <div className="space-y-2">
                  {QUIZ_HAND_RAISE_MODES.map((mode) => (
                    <label
                      key={mode}
                      className="flex items-start gap-3 cursor-pointer bg-white p-3 rounded-xl border border-slate-200"
                    >
                      <input
                        type="radio"
                        name="quiz-hand-raise-mode"
                        value={mode}
                        checked={handRaiseMode === mode}
                        onChange={() => updateBuilding({ handRaiseMode: mode })}
                        className="mt-0.5 border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-700">
                          {MODE_COPY[mode].label}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {MODE_COPY[mode].hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
        <section hidden={tab !== 'languages'}>
          <QuizReadAloudConfigurationPanel onDirtyChange={setLanguagesDirty} />
        </section>
      </div>
    </Modal>
  );
};
