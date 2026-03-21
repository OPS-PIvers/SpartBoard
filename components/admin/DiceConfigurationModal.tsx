import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Dices,
  Save,
  Loader2,
  ChevronLeft,
  Plus,
  Trash2,
  Image as ImageIcon,
  Type,
} from 'lucide-react';
import { BUILDINGS } from '@/config/buildings';
import {
  DiceGlobalConfig,
  BuildingDiceDefaults,
  CustomDie,
  FeaturePermission,
  DieFaceType,
} from '@/types';
import { Toast } from '../common/Toast';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../widgets/InstructionalRoutines/ConfirmDialog';
import { DockDefaultsPanel } from './DockDefaultsPanel';
import { useStorage } from '@/hooks/useStorage';

interface DiceConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  permission: FeaturePermission;
  onSave: (updates: Partial<FeaturePermission>) => void;
}

const DICE_COUNTS = [1, 2, 3, 4, 5, 6];

export const DiceConfigurationModal: React.FC<DiceConfigurationModalProps> = ({
  isOpen,
  onClose,
  permission,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'buildings' | 'library'>(
    'buildings'
  );
  const [selectedBuilding, setSelectedBuilding] = useState(
    BUILDINGS.length > 0 ? BUILDINGS[0].id : ''
  );

  const [globalConfig, setGlobalConfig] = useState<DiceGlobalConfig>({
    buildingDefaults: {},
    customDice: [],
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Selected Die State
  const [editingDieId, setEditingDieId] = useState<string | null>(null);
  const [currentDieDraft, setCurrentDieDraft] = useState<CustomDie | null>(
    null
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { uploadFile, uploading } = useStorage();

  // Initialize config from permission
  useEffect(() => {
    if (permission.config) {
      setGlobalConfig(permission.config as unknown as DiceGlobalConfig);
    }
    setIsLoading(false);
  }, [permission.config]);

  const handleSave = () => {
    if (editingDieId) {
      setToastMessage(
        'Please save or cancel your active die draft before applying.'
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
    (buildingId: string): BuildingDiceDefaults => {
      return globalConfig.buildingDefaults?.[buildingId] || { buildingId };
    },
    [globalConfig]
  );

  const setBuildingConfig = useCallback(
    (buildingId: string, updates: Partial<BuildingDiceDefaults>) => {
      setGlobalConfig((prev) => ({
        ...prev,
        buildingDefaults: {
          ...prev.buildingDefaults,
          [buildingId]: {
            ...getBuildingConfig(buildingId),
            ...updates,
          },
        },
      }));
    },
    [getBuildingConfig]
  );

  // Die Management
  const currentDice = useMemo(() => {
    return globalConfig.customDice ?? [];
  }, [globalConfig]);

  const startNewDie = (type: DieFaceType) => {
    const newId = `die-${crypto.randomUUID()}`;
    const newDie: CustomDie = {
      id: newId,
      name: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Die`,
      type,
      faces: Array.from({ length: 6 }, () => ({ value: '' })),
    };
    setEditingDieId(newId);
    setCurrentDieDraft(newDie);
  };

  const editDie = (die: CustomDie) => {
    setEditingDieId(die.id);
    setCurrentDieDraft({ ...die });
  };

  const deleteDie = (dieId: string) => {
    setDeleteConfirmId(dieId);
  };

  const confirmDeleteDie = () => {
    if (!deleteConfirmId) return;
    setGlobalConfig((prev) => ({
      ...prev,
      customDice: (prev.customDice ?? []).filter(
        (d) => d.id !== deleteConfirmId
      ),
    }));

    if (editingDieId === deleteConfirmId) {
      setEditingDieId(null);
      setCurrentDieDraft(null);
    }
    setDeleteConfirmId(null);
  };

  const saveDieDraft = () => {
    if (!currentDieDraft) return;

    // validation
    if (!currentDieDraft.name.trim()) {
      setToastMessage('Die name is required');
      return;
    }

    const isImage = currentDieDraft.type === 'image';
    const hasEmptyFaces = currentDieDraft.faces.some((f) => !f.value.trim());

    if (hasEmptyFaces) {
      if (isImage) {
        setToastMessage('Please upload an image for all 6 faces');
      } else {
        setToastMessage('Please provide text for all 6 faces');
      }
      return;
    }

    setGlobalConfig((prev) => {
      const dice = prev.customDice ?? [];
      const existingIndex = dice.findIndex((d) => d.id === currentDieDraft.id);
      const newDice = [...dice];
      if (existingIndex >= 0) {
        newDice[existingIndex] = currentDieDraft;
      } else {
        newDice.push(currentDieDraft);
      }
      return { ...prev, customDice: newDice };
    });

    setEditingDieId(null);
    setCurrentDieDraft(null);
  };

  const cancelDieEdit = () => {
    setEditingDieId(null);
    setCurrentDieDraft(null);
  };

  const handleFaceChange = (index: number, value: string) => {
    if (!currentDieDraft) return;
    const newFaces = [...currentDieDraft.faces];
    newFaces[index] = { value };
    setCurrentDieDraft({
      ...currentDieDraft,
      faces: newFaces,
    });
  };

  const handleImageUpload = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const path = `admin_dice/${Date.now()}-${file.name}`;
      const url = await uploadFile(path, file);
      handleFaceChange(index, url);
    } catch (err) {
      console.error('Failed to upload image', err);
      setToastMessage('Failed to upload image. Try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal-nested flex items-center justify-center bg-black/50 p-4 font-sans backdrop-blur-sm">
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}

      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Dices className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                Dice Administration
              </h2>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">
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

        {/* Tabs */}
        <div className="flex items-center space-x-6 px-6 border-b border-slate-200">
          <button
            role="tab"
            onClick={() => {
              setActiveTab('buildings');
              setEditingDieId(null);
            }}
            className={`py-3 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'buildings'
                ? 'border-brand-blue-primary text-brand-blue-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Building Defaults
          </button>
          <button
            role="tab"
            onClick={() => {
              setActiveTab('library');
            }}
            className={`py-3 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'library'
                ? 'border-brand-blue-primary text-brand-blue-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Global Library
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-6">
              {activeTab === 'buildings' && (
                <>
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
                        onClick={() => setSelectedBuilding(building.id)}
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

                  <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
                    <p className="text-sm text-slate-500 leading-tight">
                      These defaults will pre-configure the Dice widget when a
                      teacher in{' '}
                      <b>
                        {BUILDINGS.find((b) => b.id === selectedBuilding)?.name}
                      </b>{' '}
                      adds it to their dashboard.
                    </p>

                    {/* Default Dice Count */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                        Default Number of Dice
                      </label>
                      <div className="flex gap-2">
                        {DICE_COUNTS.map((count) => (
                          <button
                            key={count}
                            onClick={() =>
                              setBuildingConfig(selectedBuilding, { count })
                            }
                            className={`flex-1 py-2 rounded-lg border-2 text-sm font-black transition-all ${
                              (getBuildingConfig(selectedBuilding).count ??
                                1) === count
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            {count}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">
                        Widget default: 1 die
                      </p>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'library' && (
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  {!editingDieId ? (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-slate-800">
                          Custom Dice Library
                        </h3>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => startNewDie('text')}
                            className="gap-2"
                          >
                            <Type className="h-4 w-4" /> Add Text Die
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => startNewDie('image')}
                            className="gap-2"
                          >
                            <ImageIcon className="h-4 w-4" /> Add Image Die
                          </Button>
                        </div>
                      </div>

                      {currentDice.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                          No custom dice created yet. Click above to add one.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {currentDice.map((die) => (
                            <div
                              key={die.id}
                              className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between hover:border-indigo-300 transition-colors"
                            >
                              <div>
                                <div className="flex items-center gap-2 font-bold text-slate-800 mb-2">
                                  {die.type === 'text' ? (
                                    <Type className="h-4 w-4 text-slate-400" />
                                  ) : (
                                    <ImageIcon className="h-4 w-4 text-slate-400" />
                                  )}
                                  {die.name}
                                </div>
                                <div className="grid grid-cols-3 gap-1 mb-4">
                                  {die.faces.map((f, i) => (
                                    <div
                                      key={i}
                                      className="aspect-square bg-slate-100 rounded flex items-center justify-center text-xs overflow-hidden border border-slate-200 p-1"
                                    >
                                      {die.type === 'text' ? (
                                        <span className="truncate">
                                          {f.value || '-'}
                                        </span>
                                      ) : f.value ? (
                                        <img
                                          src={f.value}
                                          alt={`Face ${i + 1}`}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <span className="text-slate-300">
                                          -
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => editDie(die)}
                                >
                                  Edit
                                </Button>
                                <button
                                  onClick={() => deleteDie(die.id)}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete Die"
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
                    currentDieDraft && (
                      <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="flex items-center gap-2 mb-6">
                          <button
                            onClick={cancelDieEdit}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <h3 className="text-lg font-bold text-slate-800">
                            {currentDieDraft.id.startsWith('die-') &&
                            !currentDice.find(
                              (t) => t.id === currentDieDraft.id
                            )
                              ? `Create ${currentDieDraft.type === 'text' ? 'Text' : 'Image'} Die`
                              : `Edit ${currentDieDraft.name}`}
                          </h3>
                        </div>

                        <div className="space-y-6 max-w-2xl">
                          {/* Die Name */}
                          <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">
                              Die Name
                            </label>
                            <input
                              type="text"
                              value={currentDieDraft.name}
                              onChange={(e) =>
                                setCurrentDieDraft({
                                  ...currentDieDraft,
                                  name: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                              placeholder="e.g., Sight Words 1"
                            />
                          </div>

                          {/* Faces */}
                          <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                              Die Faces (6)
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              {currentDieDraft.faces.map((face, index) => (
                                <div
                                  key={index}
                                  className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex flex-col items-center"
                                >
                                  <div className="text-xs font-bold text-slate-400 mb-2">
                                    FACE {index + 1}
                                  </div>

                                  {currentDieDraft.type === 'text' ? (
                                    <input
                                      type="text"
                                      value={face.value}
                                      placeholder={`Face ${index + 1}`}
                                      onChange={(e) =>
                                        handleFaceChange(index, e.target.value)
                                      }
                                      className="w-full rounded border-slate-300 text-center shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                      maxLength={20}
                                    />
                                  ) : (
                                    <div className="w-full aspect-square relative border-2 border-dashed border-slate-300 rounded-lg overflow-hidden flex flex-col items-center justify-center bg-white hover:border-indigo-400 transition-colors">
                                      {face.value ? (
                                        <>
                                          <img
                                            src={face.value}
                                            alt={`Face ${index + 1}`}
                                            className="w-full h-full object-cover"
                                          />
                                          <label className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white text-xs font-bold">
                                            Change
                                            <input
                                              type="file"
                                              className="hidden"
                                              accept="image/*"
                                              onChange={(e) =>
                                                handleImageUpload(index, e)
                                              }
                                              disabled={uploading}
                                            />
                                          </label>
                                        </>
                                      ) : (
                                        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-indigo-500">
                                          {uploading ? (
                                            <Loader2 className="h-6 w-6 animate-spin mb-1" />
                                          ) : (
                                            <Plus className="h-6 w-6 mb-1" />
                                          )}
                                          <span className="text-xs font-bold">
                                            Upload
                                          </span>
                                          <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) =>
                                              handleImageUpload(index, e)
                                            }
                                            disabled={uploading}
                                          />
                                        </label>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                            <Button variant="secondary" onClick={cancelDieEdit}>
                              Cancel
                            </Button>
                            <Button onClick={saveDieDraft} disabled={uploading}>
                              Save Die
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
          <div className="text-sm font-bold text-slate-400">
            {isSaving ? 'APPLYING...' : 'ALL CHANGES SAVED'}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoading || !!editingDieId}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Configuration
            </Button>
          </div>
        </div>
      </div>

      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete Die"
          message="Are you sure you want to delete this custom die? Widgets using it will fall back to standard numbers."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={confirmDeleteDie}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
};
