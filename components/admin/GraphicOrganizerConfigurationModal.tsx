import React, { useState, useCallback, useMemo } from 'react';
import {
  X,
  FileText,
  Save,
  Loader2,
  ChevronLeft,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  GraphicOrganizerGlobalConfig,
  GraphicOrganizerBuildingConfig,
  GraphicOrganizerTemplate,
  GraphicOrganizerLayoutType,
  GlobalFontFamily,
  FeaturePermission,
} from '@/types';
import { Toast } from '../common/Toast';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../widgets/InstructionalRoutines/ConfirmDialog';
import { DockDefaultsPanel } from './DockDefaultsPanel';

interface GraphicOrganizerConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  permission: FeaturePermission;
  onSave: (updates: Partial<FeaturePermission>) => void;
}

const LAYOUT_OPTIONS: {
  value: GraphicOrganizerLayoutType;
  label: string;
  nodes: string[];
}[] = [
  {
    value: 'frayer',
    label: 'Frayer Model',
    nodes: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'center'],
  },
  {
    value: 't-chart',
    label: 'T-Chart',
    nodes: ['leftHeader', 'rightHeader', 'leftContent', 'rightContent'],
  },
  {
    value: 'venn',
    label: 'Venn Diagram',
    nodes: ['leftCircle', 'rightCircle', 'intersection'],
  },
  { value: 'kwl', label: 'KWL Chart', nodes: ['k', 'w', 'l'] },
  {
    value: 'cause-effect',
    label: 'Cause & Effect',
    nodes: ['cause', 'effect'],
  },
];

const FONT_OPTIONS: { value: GlobalFontFamily; label: string }[] = [
  { value: 'sans', label: 'Sans Serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'handwritten', label: 'Handwritten' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'comic', label: 'Comic' },
  { value: 'fun', label: 'Fun' },
  { value: 'slab', label: 'Slab' },
  { value: 'retro', label: 'Retro' },
  { value: 'marker', label: 'Marker' },
  { value: 'cursive', label: 'Cursive' },
];

const normalizeConfig = (raw: unknown): GraphicOrganizerGlobalConfig => {
  const config = raw as GraphicOrganizerGlobalConfig;
  return {
    ...config,
    buildings: config?.buildings ?? {},
  };
};

export const GraphicOrganizerConfigurationModal: React.FC<
  GraphicOrganizerConfigurationModalProps
> = ({ isOpen, onClose, permission, onSave }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuilding, setSelectedBuilding] =
    useBuildingSelection(BUILDINGS);
  const [globalConfig, setGlobalConfig] =
    useState<GraphicOrganizerGlobalConfig>(() =>
      normalizeConfig(permission.config)
    );

  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Selected Template State
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [currentTemplateDraft, setCurrentTemplateDraft] =
    useState<GraphicOrganizerTemplate | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Sync state if permission.config changes externally, avoiding useEffect.
  const [prevConfig, setPrevConfig] = useState(permission.config);
  if (permission.config !== prevConfig) {
    setPrevConfig(permission.config);
    setGlobalConfig(normalizeConfig(permission.config));
  }

  const handleSave = () => {
    if (editingTemplateId) {
      setToastMessage(
        'Please save or cancel your active template draft before applying.'
      );
      return;
    }

    setIsSaving(true);
    try {
      onSave({
        config: globalConfig as unknown as Record<string, unknown>,
      });
      setToastMessage('Configuration applied locally');
      onClose();
    } catch (error) {
      console.error('Error applying config:', error);
      setToastMessage('Error applying configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const getBuildingConfig = useCallback(
    (buildingId: string): GraphicOrganizerBuildingConfig => {
      return globalConfig.buildings[buildingId] || { templates: [] };
    },
    [globalConfig]
  );

  const setBuildingConfig = useCallback(
    (buildingId: string, config: GraphicOrganizerBuildingConfig) => {
      setGlobalConfig((prev) => ({
        ...prev,
        buildings: {
          ...prev.buildings,
          [buildingId]: config,
        },
      }));
    },
    []
  );

  // Template Management
  const currentTemplates = useMemo(() => {
    return getBuildingConfig(selectedBuilding).templates;
  }, [getBuildingConfig, selectedBuilding]);

  const startNewTemplate = () => {
    const newId = `template-${crypto.randomUUID()}`;
    const newTemplate: GraphicOrganizerTemplate = {
      id: newId,
      name: 'New Custom Template',
      layout: 'frayer',
      defaultNodes: {
        topLeft: 'Definition',
        topRight: 'Characteristics',
        bottomLeft: 'Examples',
        bottomRight: 'Non-Examples',
        center: 'Concept',
      },
      fontFamily: 'sans',
    };
    setEditingTemplateId(newId);
    setCurrentTemplateDraft(newTemplate);
  };

  const editTemplate = (template: GraphicOrganizerTemplate) => {
    setEditingTemplateId(template.id);
    setCurrentTemplateDraft({ ...template });
  };

  const deleteTemplate = (templateId: string) => {
    setDeleteConfirmId(templateId);
  };

  const confirmDeleteTemplate = () => {
    if (!deleteConfirmId) return;
    const config = getBuildingConfig(selectedBuilding);
    setBuildingConfig(selectedBuilding, {
      ...config,
      templates: config.templates.filter((t) => t.id !== deleteConfirmId),
    });
    if (editingTemplateId === deleteConfirmId) {
      setEditingTemplateId(null);
      setCurrentTemplateDraft(null);
    }
    setDeleteConfirmId(null);
  };

  const saveTemplateDraft = () => {
    if (!currentTemplateDraft) return;

    const config = getBuildingConfig(selectedBuilding);
    const existingIndex = config.templates.findIndex(
      (t) => t.id === currentTemplateDraft.id
    );

    const newTemplates = [...config.templates];
    if (existingIndex >= 0) {
      newTemplates[existingIndex] = currentTemplateDraft;
    } else {
      newTemplates.push(currentTemplateDraft);
    }

    setBuildingConfig(selectedBuilding, { ...config, templates: newTemplates });
    setEditingTemplateId(null);
    setCurrentTemplateDraft(null);
  };

  const cancelTemplateEdit = () => {
    setEditingTemplateId(null);
    setCurrentTemplateDraft(null);
  };

  const handleLayoutChange = (layout: GraphicOrganizerLayoutType) => {
    if (!currentTemplateDraft) return;

    const layoutDef = LAYOUT_OPTIONS.find((l) => l.value === layout);
    if (!layoutDef) return;

    // Initialize new nodes based on layout
    const newDefaultNodes: Record<string, string> = {};
    layoutDef.nodes.forEach((node) => {
      newDefaultNodes[node] = ''; // Reset node labels
    });

    setCurrentTemplateDraft({
      ...currentTemplateDraft,
      layout,
      defaultNodes: newDefaultNodes,
    });
  };

  const handleNodeLabelChange = (nodeKey: string, value: string) => {
    if (!currentTemplateDraft) return;
    setCurrentTemplateDraft({
      ...currentTemplateDraft,
      defaultNodes: {
        ...currentTemplateDraft.defaultNodes,
        [nodeKey]: value,
      },
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal-nested flex items-center justify-center bg-slate-900/50 p-4 font-sans backdrop-blur-sm">
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}

      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                Organizer Administration
              </h2>
              <p className="text-sm font-medium text-slate-500">
                GLOBAL SETTINGS & BUILDING DEFAULTS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-6">
            {/* Dock Defaults */}
            <DockDefaultsPanel
              config={{
                dockDefaults: globalConfig.dockDefaults ?? {},
              }}
              onChange={(d) =>
                setGlobalConfig((prev) => ({
                  ...prev,
                  dockDefaults: d,
                }))
              }
            />

            <div className="mb-6 flex space-x-2 border-b border-slate-200 pb-2">
              {BUILDINGS.map((building) => (
                <button
                  key={building.id}
                  onClick={() => {
                    setSelectedBuilding(building.id);
                    setEditingTemplateId(null);
                    setCurrentTemplateDraft(null);
                  }}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
                    selectedBuilding === building.id
                      ? 'bg-white text-indigo-600 border border-slate-200 border-b-white -mb-[9px] z-10'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {building.name}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              {!editingTemplateId ? (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800">
                      Custom Templates
                    </h3>
                    <Button
                      size="sm"
                      onClick={startNewTemplate}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" /> Add Template
                    </Button>
                  </div>

                  {currentTemplates.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                      No custom templates for this building yet. Click &quot;Add
                      Template&quot; to create one.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {currentTemplates.map((template) => (
                        <div
                          key={template.id}
                          className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between hover:border-indigo-300 transition-colors"
                        >
                          <div>
                            <div className="font-bold text-slate-800">
                              {template.name}
                            </div>
                            <div className="text-sm text-slate-500 mb-2">
                              {
                                LAYOUT_OPTIONS.find(
                                  (l) => l.value === template.layout
                                )?.label
                              }
                            </div>
                            <div className="text-xs font-mono bg-slate-100 p-1 rounded inline-block text-slate-600 mb-4">
                              {template.fontFamily}
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => editTemplate(template)}
                            >
                              Edit
                            </Button>
                            <button
                              onClick={() => deleteTemplate(template.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Template"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                currentTemplateDraft && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center gap-2 mb-6">
                      <button
                        onClick={cancelTemplateEdit}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <h3 className="text-lg font-bold text-slate-800">
                        {currentTemplateDraft.id.startsWith('template-') &&
                        !currentTemplates.find(
                          (t) => t.id === currentTemplateDraft.id
                        )
                          ? 'Create Template'
                          : 'Edit Template'}
                      </h3>
                    </div>

                    <div className="space-y-6 max-w-2xl">
                      {/* Template Name */}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">
                          Template Name
                        </label>
                        <input
                          type="text"
                          value={currentTemplateDraft.name}
                          onChange={(e) =>
                            setCurrentTemplateDraft({
                              ...currentTemplateDraft,
                              name: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                          placeholder="e.g., Weekly Frayer Model"
                        />
                      </div>

                      {/* Base Layout */}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">
                          Base Layout
                        </label>
                        <select
                          value={currentTemplateDraft.layout}
                          onChange={(e) =>
                            handleLayoutChange(
                              e.target.value as GraphicOrganizerLayoutType
                            )
                          }
                          className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        >
                          {LAYOUT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Font Family */}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">
                          Font Family
                        </label>
                        <select
                          value={currentTemplateDraft.fontFamily ?? 'sans'}
                          onChange={(e) =>
                            setCurrentTemplateDraft({
                              ...currentTemplateDraft,
                              fontFamily: e.target.value as GlobalFontFamily,
                            })
                          }
                          className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        >
                          {FONT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Node Default Labels */}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          Default Node Labels
                        </label>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-2 gap-4">
                          {Object.keys(currentTemplateDraft.defaultNodes).map(
                            (nodeKey) => (
                              <div key={nodeKey}>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                  {nodeKey}
                                </label>
                                <input
                                  type="text"
                                  value={
                                    currentTemplateDraft.defaultNodes[nodeKey]
                                  }
                                  onChange={(e) =>
                                    handleNodeLabelChange(
                                      nodeKey,
                                      e.target.value
                                    )
                                  }
                                  className="w-full rounded-md border-slate-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                  placeholder={`Enter ${nodeKey} text...`}
                                />
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <Button
                          variant="secondary"
                          onClick={cancelTemplateEdit}
                        >
                          Cancel
                        </Button>
                        <Button onClick={saveTemplateDraft}>
                          Save Template
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
          <div className="text-sm font-bold text-slate-400">
            {isSaving ? 'APPLYING...' : 'PENDING PARENT SAVE'}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !!editingTemplateId}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Apply Configuration
            </Button>
          </div>
        </div>
      </div>
      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete Template"
          message="Are you sure you want to delete this template? This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={confirmDeleteTemplate}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
};
