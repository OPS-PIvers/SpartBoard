import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Puzzle,
  Code2,
  LayoutTemplate,
  Blocks,
  SlidersHorizontal,
  Workflow,
} from 'lucide-react';
import { CustomWidgetDoc, CustomGridCell } from '@/types';
import { useCustomWidgets } from '@/context/useCustomWidgets';
import { useAuth } from '@/context/useAuth';
import {
  BuilderState,
  BuilderStep,
  builderStateToDoc,
  WidgetMeta,
} from './types';
import { BuilderGrid } from './BuilderGrid';
import { BlockPalette } from './BlockPalette';
import { CellEditor } from './CellEditor';
import { buildDefaultConfig } from './blockDefaults';
import { ConnectionsTab } from './ConnectionsTab';
import { CodeEditorPane, INITIAL_HTML_TEMPLATE } from './CodeEditorPane';
import { WidgetMetaEditor } from './WidgetMetaEditor';
import { SettingsDefEditor } from './SettingsDefEditor';
import { PreviewPane } from './PreviewPane';
import { getCustomWidgetIcon } from '@/config/customWidgetIcons';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initialCells(columns: number, rows: number): CustomGridCell[] {
  const cells: CustomGridCell[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= columns; col++) {
      cells.push({
        id: crypto.randomUUID(),
        colStart: col,
        rowStart: row,
        colSpan: 1,
        rowSpan: 1,
        block: null,
      });
    }
  }
  return cells;
}

function renderSelectedMetaIcon(iconKey: string): React.ReactNode {
  const Icon = getCustomWidgetIcon(iconKey);
  if (Icon) return <Icon size={28} className="text-blue-300" />;
  if (iconKey.trim().length === 0) {
    return <Puzzle size={28} className="text-blue-300" />;
  }
  return (
    <span aria-hidden="true" className="text-2xl leading-none">
      {iconKey}
    </span>
  );
}

const INITIAL_META: WidgetMeta = {
  title: '',
  slug: '',
  description: '',
  icon: 'Puzzle',
  color: 'bg-blue-500',
  defaultWidth: 400,
  defaultHeight: 300,
  buildings: [],
  accessLevel: 'public',
  betaUsers: [],
};

function buildInitialState(existing?: CustomWidgetDoc | null): BuilderState {
  if (existing) {
    return {
      step: 'build',
      mode: existing.mode,
      gridDefinition: existing.gridDefinition ?? {
        columns: 2,
        rows: 2,
        cells: initialCells(2, 2),
        connections: [],
      },
      codeContent: existing.codeContent ?? INITIAL_HTML_TEMPLATE,
      meta: {
        title: existing.title,
        slug: existing.slug,
        description: existing.description ?? '',
        icon: existing.icon,
        color: existing.color,
        defaultWidth: existing.defaultWidth,
        defaultHeight: existing.defaultHeight,
        buildings: existing.buildings,
        accessLevel: existing.accessLevel,
        betaUsers: existing.betaUsers,
      },
      settingsDefs: existing.settings ?? [],
    };
  }

  return {
    step: 'mode',
    mode: 'block',
    gridDefinition: {
      columns: 2,
      rows: 2,
      cells: initialCells(2, 2),
      connections: [],
    },
    codeContent: INITIAL_HTML_TEMPLATE,
    meta: INITIAL_META,
    settingsDefs: [],
  };
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS: { key: BuilderStep; label: string }[] = [
  { key: 'mode', label: 'Choose Mode' },
  { key: 'build', label: 'Build' },
  { key: 'settings', label: 'Settings' },
  { key: 'preview', label: 'Preview & Publish' },
];

function stepIndex(step: BuilderStep): number {
  return STEPS.findIndex((s) => s.key === step);
}

interface StepIndicatorProps {
  currentStep: BuilderStep;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const current = stepIndex(currentStep);
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={s.key}>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700 text-slate-400'
                }`}
              >
                {done ? <Check size={12} /> : i + 1}
              </div>
              <span
                className={`text-xs hidden sm:block ${active ? 'text-white font-medium' : done ? 'text-emerald-400' : 'text-slate-500'}`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px w-8 ${done ? 'bg-emerald-500' : 'bg-slate-700'}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mode selection step
// ---------------------------------------------------------------------------

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

const ModeCard: React.FC<ModeCardProps> = ({
  icon,
  title,
  description,
  onClick,
}) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-4 p-8 bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 hover:border-blue-500 rounded-2xl transition-all group text-center flex-1"
  >
    <div className="text-5xl leading-none group-hover:scale-110 transition-transform">
      {icon}
    </div>
    <div>
      <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  </button>
);

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export interface WidgetBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingWidget?: CustomWidgetDoc | null;
}

export const WidgetBuilderModal: React.FC<WidgetBuilderModalProps> = ({
  isOpen,
  onClose,
  existingWidget,
}) => {
  const { user } = useAuth();
  const { saveCustomWidget, setPublished } = useCustomWidgets();

  const [state, setState] = useState<BuilderState>(() =>
    buildInitialState(existingWidget)
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Track selected cell for CellEditor
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [blockBuildStep, setBlockBuildStep] = useState<
    'layout' | 'blocks' | 'details' | 'connections'
  >('layout');

  // Reset builder state whenever the modal is opened or the widget being
  // edited changes (e.g. user closes and reopens with a different widget).
  useEffect(() => {
    if (!isOpen) return;
    setState(buildInitialState(existingWidget));
    setSaving(false);
    setSaveMessage(null);
    setSelectedCellId(null);
    setBlockBuildStep('layout');
  }, [isOpen, existingWidget]);

  const update = useCallback((updates: Partial<BuilderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const currentStepIdx = stepIndex(state.step);
  const isFirstStep = currentStepIdx === 0;
  const isLastStep = currentStepIdx === STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) return;
    const nextStep = STEPS[currentStepIdx + 1].key;
    update({ step: nextStep });
  };

  const handleBack = () => {
    if (isFirstStep) return;
    const prevStep = STEPS[currentStepIdx - 1].key;
    update({ step: prevStep });
  };

  const handleSelectMode = (mode: 'block' | 'code') => {
    update({ mode, step: 'build' });
  };

  const handleSave = async (publish: boolean) => {
    if (!user?.email) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const doc = builderStateToDoc(
        state,
        user.email,
        existingWidget?.id,
        existingWidget ?? undefined
      );
      const id = await saveCustomWidget(doc);
      if (publish) {
        await setPublished(id, true);
      }
      setSaveMessage({
        type: 'success',
        text: publish
          ? 'Widget published successfully!'
          : 'Draft saved successfully!',
      });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save widget.',
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedCell =
    state.gridDefinition.cells.find((c) => c.id === selectedCellId) ?? null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col w-full h-full bg-slate-900 overflow-hidden">
        {/* ── Top bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Puzzle size={20} className="text-blue-400" />
            <h2 className="text-base font-bold text-white">
              {existingWidget ? 'Edit Widget' : 'Widget Builder'}
            </h2>
          </div>

          <div className="flex-1 max-w-lg mx-6">
            <StepIndicator currentStep={state.step} />
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Step content ────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {/* STEP: Choose Mode */}
          {state.step === 'mode' && (
            <div className="flex items-center justify-center h-full p-12">
              <div className="w-full max-w-3xl">
                <h2 className="text-2xl font-bold text-white text-center mb-2">
                  How do you want to build this widget?
                </h2>
                <p className="text-slate-400 text-center text-sm mb-10">
                  Choose the builder mode that fits your skill level and widget
                  complexity.
                </p>
                <div className="flex gap-6">
                  <ModeCard
                    icon={<Puzzle />}
                    title="Block Builder"
                    description="Drag blocks onto a grid. Perfect for interactive quizzes, games, and activities. No code needed."
                    onClick={() => handleSelectMode('block')}
                  />
                  <ModeCard
                    icon={<Code2 />}
                    title="Code Editor"
                    description="Write HTML/CSS/JS with AI assistance. Full control over widget design and behavior."
                    onClick={() => handleSelectMode('code')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP: Build */}
          {state.step === 'build' && state.mode === 'block' && (
            <div className="h-full overflow-hidden p-4">
              <div className="h-full rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden flex flex-col">
                <div className="border-b border-slate-700 px-4 py-3 bg-slate-800/70">
                  <p className="text-sm font-semibold text-white">
                    Guided Block Builder
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Build your widget one step at a time. This flow is made for
                    non-coders.
                  </p>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[
                      {
                        key: 'layout',
                        label: '1. Layout',
                        icon: LayoutTemplate,
                      },
                      { key: 'blocks', label: '2. Blocks', icon: Blocks },
                      {
                        key: 'details',
                        label: '3. Details',
                        icon: SlidersHorizontal,
                      },
                      {
                        key: 'connections',
                        label: '4. Connect',
                        icon: Workflow,
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = blockBuildStep === item.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() =>
                            setBlockBuildStep(
                              item.key as
                                | 'layout'
                                | 'blocks'
                                | 'details'
                                | 'connections'
                            )
                          }
                          className={`flex items-center justify-center gap-2 rounded-lg border px-2 py-2 text-xs transition-colors ${
                            active
                              ? 'border-blue-500 bg-blue-900/40 text-blue-200'
                              : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                          }`}
                        >
                          <Icon size={13} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-12">
                  <div className="col-span-8 p-3 overflow-auto border-r border-slate-700">
                    <BuilderGrid
                      gridDefinition={state.gridDefinition}
                      onChange={(grid) => update({ gridDefinition: grid })}
                      selectedCellId={selectedCellId}
                      onSelectCell={setSelectedCellId}
                    />
                  </div>
                  <div className="col-span-4 p-3 overflow-auto">
                    {blockBuildStep === 'layout' && (
                      <div className="space-y-3 text-sm">
                        <h4 className="font-semibold text-white">
                          Step 1: Set your layout
                        </h4>
                        <p className="text-slate-400 text-xs">
                          Start simple: choose the number of rows and columns,
                          then merge cells to create larger areas.
                        </p>
                        <ul className="text-xs text-slate-500 list-disc list-inside space-y-1">
                          <li>Click + / - in the grid toolbar to resize.</li>
                          <li>
                            Shift+click cells, then Merge for big regions.
                          </li>
                          <li>
                            Click a cell to prepare it for adding content.
                          </li>
                        </ul>
                      </div>
                    )}

                    {blockBuildStep === 'blocks' && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-white text-sm">
                          Step 2: Choose what goes in each area
                        </h4>
                        <p className="text-slate-400 text-xs">
                          Pick a cell first, then click a block below to place
                          it.
                        </p>
                        <BlockPalette
                          onSelectBlock={(blockType) => {
                            if (!selectedCellId) return;
                            const cell = state.gridDefinition.cells.find(
                              (c) => c.id === selectedCellId
                            );
                            if (!cell) return;
                            const newBlock = {
                              id: crypto.randomUUID(),
                              type: blockType,
                              config: buildDefaultConfig(blockType) as never,
                              style: {},
                            };
                            const newCells = state.gridDefinition.cells.map(
                              (c) =>
                                c.id === selectedCellId
                                  ? { ...c, block: newBlock }
                                  : c
                            );
                            update({
                              gridDefinition: {
                                ...state.gridDefinition,
                                cells: newCells,
                              },
                            });
                          }}
                        />
                      </div>
                    )}

                    {blockBuildStep === 'details' && (
                      <CellEditor
                        cell={selectedCell}
                        onUpdateBlock={(cellId, block) => {
                          const newCells = state.gridDefinition.cells.map(
                            (c) => (c.id === cellId ? { ...c, block } : c)
                          );
                          update({
                            gridDefinition: {
                              ...state.gridDefinition,
                              cells: newCells,
                            },
                          });
                        }}
                        onDropBlock={() => {
                          // Handled via BlockPalette onSelectBlock
                        }}
                        onClose={() => setSelectedCellId(null)}
                      />
                    )}

                    {blockBuildStep === 'connections' && (
                      <ConnectionsTab
                        gridDefinition={state.gridDefinition}
                        onChange={(grid) => update({ gridDefinition: grid })}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {state.step === 'build' && state.mode === 'code' && (
            <div className="h-full p-4">
              <CodeEditorPane
                code={state.codeContent}
                onChange={(codeContent) => update({ codeContent })}
              />
            </div>
          )}

          {/* STEP: Settings */}
          {state.step === 'settings' && (
            <div className="h-full overflow-auto p-6">
              <div className="max-w-5xl mx-auto">
                <h3 className="text-lg font-bold text-white mb-6">
                  Widget Settings
                </h3>
                <div className="grid grid-cols-2 gap-8">
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
                    <WidgetMetaEditor
                      meta={state.meta}
                      onChange={(meta) => update({ meta })}
                    />
                  </div>
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
                    <SettingsDefEditor
                      settingsDefs={state.settingsDefs}
                      onChange={(settingsDefs) => update({ settingsDefs })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP: Preview & Publish */}
          {state.step === 'preview' && (
            <div className="h-full overflow-auto p-6">
              <div className="max-w-5xl mx-auto flex flex-col gap-6 h-full">
                {/* Summary header */}
                <div className="flex items-center gap-4 bg-slate-800 rounded-xl border border-slate-700 px-5 py-4">
                  <span className="w-14 h-14 rounded-2xl bg-slate-700 flex items-center justify-center">
                    {renderSelectedMetaIcon(state.meta.icon)}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {state.meta.title || (
                        <span className="text-slate-500 italic">
                          Unnamed Widget
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {state.meta.description || (
                        <span className="italic">No description</span>
                      )}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="font-mono">
                        {state.meta.slug || '—'}
                      </span>
                      <span>·</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-white text-xs ${state.meta.color}`}
                      >
                        {state.meta.accessLevel}
                      </span>
                      <span>·</span>
                      <span>
                        {state.mode === 'code' ? 'Code widget' : 'Block widget'}
                      </span>
                      <span>·</span>
                      <span>
                        {state.meta.defaultWidth}×{state.meta.defaultHeight}px
                      </span>
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="flex-1 min-h-0" style={{ height: '400px' }}>
                  {state.mode === 'code' ? (
                    <PreviewPane
                      content={state.codeContent}
                      mode="code"
                      title={state.meta.title}
                    />
                  ) : (
                    <div className="h-full bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-center">
                      <div className="text-center text-slate-500">
                        <Puzzle
                          size={48}
                          className="mx-auto mb-3 text-slate-600"
                        />
                        <p className="text-sm font-medium">Block Widget</p>
                        <p className="text-xs mt-1">
                          {
                            state.gridDefinition.cells.filter(
                              (c) => c.block !== null
                            ).length
                          }{' '}
                          of {state.gridDefinition.cells.length} cells filled ·{' '}
                          {state.gridDefinition.columns} col ×{' '}
                          {state.gridDefinition.rows} rows
                        </p>
                        <p className="text-xs mt-1 text-slate-600">
                          {state.gridDefinition.connections.length}{' '}
                          connection(s)
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Settings summary */}
                {state.settingsDefs.length > 0 && (
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      {state.settingsDefs.length} Admin Setting(s)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {state.settingsDefs.map((def) => (
                        <span
                          key={def.key}
                          className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300 font-mono"
                        >
                          {def.key}:{' '}
                          <span className="text-amber-400">{def.type}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Save message */}
                {saveMessage && (
                  <div
                    className={`rounded-lg px-4 py-2 text-sm ${
                      saveMessage.type === 'success'
                        ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-300'
                        : 'bg-red-900/40 border border-red-700 text-red-300'
                    }`}
                  >
                    {saveMessage.text}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 justify-end flex-shrink-0">
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving || !state.meta.title.trim()}
                    className="px-5 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save as Draft'}
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving || !state.meta.title.trim()}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {saving ? 'Publishing...' : 'Publish Widget'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom nav ──────────────────────────────────────── */}
        {state.step !== 'mode' && state.step !== 'preview' && (
          <div className="flex items-center justify-between px-6 py-3 bg-slate-800 border-t border-slate-700 flex-shrink-0">
            <button
              onClick={handleBack}
              disabled={isFirstStep}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <ChevronLeft size={16} />
              Back
            </button>

            <button
              onClick={handleNext}
              disabled={isLastStep}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Show back button on preview step */}
        {state.step === 'preview' && (
          <div className="flex items-center px-6 py-3 bg-slate-800 border-t border-slate-700 flex-shrink-0">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ChevronLeft size={16} />
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
