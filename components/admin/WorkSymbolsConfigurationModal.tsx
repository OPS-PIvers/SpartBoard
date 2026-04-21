import React, { useCallback, useRef, useState } from 'react';
import {
  X,
  Upload,
  Trash2,
  Loader2,
  Save,
  Image as ImageIcon,
} from 'lucide-react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import {
  FeaturePermission,
  WorkSymbol,
  WorkSymbolsGlobalConfig,
} from '@/types';
import { useStorage } from '@/hooks/useStorage';
import { Toast } from '../common/Toast';
import { Button } from '../common/Button';
import { Card } from '../common/Card';

interface WorkSymbolsConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  permission: FeaturePermission;
  onSave: (updates: Partial<FeaturePermission>) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const normalizeConfig = (raw: unknown): WorkSymbolsGlobalConfig => {
  const config = raw as WorkSymbolsGlobalConfig | undefined;
  return { symbols: config?.symbols ?? [] };
};

export const WorkSymbolsConfigurationModal: React.FC<
  WorkSymbolsConfigurationModalProps
> = ({ isOpen, onClose, permission, onSave }) => {
  const BUILDINGS = useAdminBuildings();
  const [globalConfig, setGlobalConfig] = useState<WorkSymbolsGlobalConfig>(
    () => normalizeConfig(permission.config)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedThisSessionRef = useRef<Set<string>>(new Set());

  const { uploadAdminWorkSymbol, deleteFile } = useStorage();

  // Sync state if permission.config changes externally
  const [prevConfig, setPrevConfig] = useState(permission.config);
  if (permission.config !== prevConfig) {
    setPrevConfig(permission.config);
    setGlobalConfig(normalizeConfig(permission.config));
  }

  const setSymbols = useCallback((symbols: WorkSymbol[]) => {
    setGlobalConfig((prev) => ({ ...prev, symbols }));
  }, []);

  // --- Upload ---
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith('image/')
      );
      if (!imageFiles.length) return;

      const oversized = imageFiles.filter((f) => f.size > MAX_FILE_SIZE);
      const fileArray = imageFiles.filter((f) => f.size <= MAX_FILE_SIZE);

      if (oversized.length > 0) {
        setToastMessage(
          `${oversized.length} file${oversized.length > 1 ? 's' : ''} exceeded 5MB limit and ${oversized.length > 1 ? 'were' : 'was'} skipped`
        );
      }

      if (!fileArray.length) return;

      setUploading(true);
      const newSymbols: WorkSymbol[] = [];
      for (const file of fileArray) {
        try {
          const url = await uploadAdminWorkSymbol(file);
          if (url) {
            uploadedThisSessionRef.current.add(url);
            newSymbols.push({
              id: crypto.randomUUID(),
              title: file.name.replace(/\.[^.]+$/, ''),
              imageUrl: url,
              buildings: [],
            });
          }
        } catch (e) {
          console.error('Failed to upload work symbol:', e);
        }
      }
      if (newSymbols.length > 0) {
        setSymbols([...globalConfig.symbols, ...newSymbols]);
      }
      setUploading(false);
    },
    [globalConfig.symbols, setSymbols, uploadAdminWorkSymbol]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  const removeSymbol = (symbol: WorkSymbol) => {
    if (uploadedThisSessionRef.current.has(symbol.imageUrl)) {
      uploadedThisSessionRef.current.delete(symbol.imageUrl);
      void deleteFile(symbol.imageUrl);
    }
    setSymbols(globalConfig.symbols.filter((s) => s.id !== symbol.id));
  };

  const updateSymbolTitle = (symbolId: string, title: string) => {
    setSymbols(
      globalConfig.symbols.map((s) => (s.id === symbolId ? { ...s, title } : s))
    );
  };

  const toggleBuilding = (symbolId: string, buildingId: string) => {
    setSymbols(
      globalConfig.symbols.map((s) => {
        if (s.id !== symbolId) return s;
        const current = s.buildings;
        const next = current.includes(buildingId)
          ? current.filter((b) => b !== buildingId)
          : [...current, buildingId];
        return { ...s, buildings: next };
      })
    );
  };

  // --- Save / Close ---
  const handleSave = () => {
    setIsSaving(true);
    try {
      onSave({
        config: globalConfig as unknown as Record<string, unknown>,
      });
      uploadedThisSessionRef.current.clear();
      setToastMessage('Work Symbols configuration saved');
      onClose();
    } catch (error) {
      console.error('Error saving config:', error);
      setToastMessage('Error saving configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    for (const url of uploadedThisSessionRef.current) {
      void deleteFile(url);
    }
    uploadedThisSessionRef.current.clear();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal-nested bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Work Symbols</h2>
              <p className="text-xs text-slate-500">
                Upload images and assign them to buildings
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all p-8 gap-3 ${
              isDragging
                ? 'border-violet-400 bg-violet-50'
                : 'border-slate-300 bg-white hover:border-violet-300 hover:bg-violet-50/30'
            } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                <p className="text-sm font-bold text-slate-500">Uploading...</p>
              </>
            ) : (
              <>
                <div className="p-3 bg-slate-100 rounded-xl">
                  <Upload className="w-6 h-6 text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-slate-600 uppercase tracking-tight">
                    Drop images here or click to upload
                  </p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                    PNG, JPG, or WebP
                  </p>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInput}
              disabled={uploading}
            />
          </div>

          {/* Symbol Grid */}
          {globalConfig.symbols.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center bg-white border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">
              <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-black uppercase tracking-widest text-xs">
                No work symbols yet
              </p>
              <p className="text-xs mt-1">
                Upload images above to create work symbols.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {globalConfig.symbols.map((symbol) => (
                <Card
                  key={symbol.id}
                  padding="sm"
                  hoverable
                  className="flex flex-col gap-3 group"
                >
                  {/* Image preview */}
                  <div className="relative aspect-square bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden">
                    <img
                      src={symbol.imageUrl}
                      alt={symbol.title}
                      className="w-full h-full object-contain p-4"
                      loading="lazy"
                    />
                    <button
                      onClick={() => removeSymbol(symbol)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600 p-1.5 z-10"
                      title="Remove symbol"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Title input */}
                  <input
                    type="text"
                    value={symbol.title}
                    onChange={(e) =>
                      updateSymbolTitle(symbol.id, e.target.value)
                    }
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-violet-400 focus:outline-none"
                    placeholder="Symbol title..."
                  />

                  {/* Building toggles */}
                  {BUILDINGS.length > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-xxs font-black uppercase text-slate-400 tracking-widest block px-1">
                        Buildings
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {BUILDINGS.map((b) => {
                          const isAssigned =
                            symbol.buildings.length === 0 ||
                            symbol.buildings.includes(b.id);
                          const isExplicit = symbol.buildings.includes(b.id);
                          const isAllBuildings = symbol.buildings.length === 0;
                          return (
                            <button
                              key={b.id}
                              onClick={() => {
                                if (isAllBuildings) {
                                  // Switching from "all" to explicit: set all except this one
                                  const allExcept = BUILDINGS.map(
                                    (x) => x.id
                                  ).filter((id) => id !== b.id);
                                  setSymbols(
                                    globalConfig.symbols.map((s) =>
                                      s.id === symbol.id
                                        ? { ...s, buildings: allExcept }
                                        : s
                                    )
                                  );
                                } else {
                                  toggleBuilding(symbol.id, b.id);
                                }
                              }}
                              className={`px-2 py-1 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                                isAssigned
                                  ? isExplicit || isAllBuildings
                                    ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                    : 'bg-violet-100 text-violet-600 border-violet-200'
                                  : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200 hover:text-slate-500'
                              }`}
                              title={
                                isAllBuildings
                                  ? 'Available to all buildings (click to remove)'
                                  : isExplicit
                                    ? 'Click to remove from this building'
                                    : 'Click to add to this building'
                              }
                            >
                              {b.name}
                            </button>
                          );
                        })}
                      </div>
                      {symbol.buildings.length === 0 && (
                        <p className="text-xxs text-slate-400 px-1">
                          Available to all buildings
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={isSaving}
            icon={<Save className="w-4 h-4" />}
          >
            Save
          </Button>
        </div>
      </div>

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  );
};
