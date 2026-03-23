import React, { useState } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDialog } from '@/context/useDialog';
import {
  WidgetData,
  RevealGridConfig,
  RevealCard,
  GlobalFontFamily,
} from '@/types';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Save,
  Share2,
  FolderOpen,
  Loader2,
  ClipboardType,
  Upload,
  Sparkles,
} from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';

export const RevealGridSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { driveService } = useGoogleDrive();
  const { showAlert } = useDialog();
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [existingFiles, setExistingFiles] = useState<
    { id: string; name: string }[]
  >([]);
  const config = widget.config as RevealGridConfig;
  const cards = config.cards ?? [];
  const columns = config.columns ?? 3;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [pasteData, setPasteData] = useState('');

  // Drive Logic
  const fetchDriveFiles = React.useCallback(async () => {
    if (!driveService) return;
    try {
      setIsLoadingDrive(true);

      const folderId = await driveService.getFolderPath('RevealGridSets');
      if (folderId) {
        const files = await driveService.listFiles(
          `'${folderId}' in parents and trashed = false`
        );
        setExistingFiles(files);
      }
    } catch (error) {
      console.error('[RevealGrid] Error fetching files:', error);
    } finally {
      setIsLoadingDrive(false);
    }
  }, [driveService]);

  // Fetch files when component mounts if Drive is available
  React.useEffect(() => {
    if (driveService) {
      void fetchDriveFiles();
    }
  }, [driveService, fetchDriveFiles]);

  const handleSaveToDrive = async () => {
    // Using these for linting

    if (!driveService) {
      await showAlert('Please connect Google Drive in your profile settings.', {
        variant: 'error',
        title: 'Drive Not Connected',
      });
      return;
    }

    try {
      setIsLoadingDrive(true);
      const fileName =
        config.setName ?? `Practice Set ${new Date().toLocaleDateString()}`;
      const contentStr = JSON.stringify({
        cards,
        columns,
        revealMode: config.revealMode,
        setName: fileName,
      });

      let fileId = config.activeDriveFileId;
      if (fileId) {
        // Update existing
        await driveService.updateFileContent(
          fileId,
          new Blob([contentStr], { type: 'application/json' })
        );
      } else {
        // Create new

        const blob = new Blob([contentStr], { type: 'application/json' });
        const driveFile = await driveService.uploadFile(
          blob,
          fileName,
          'RevealGridSets'
        );
        fileId = driveFile.id;

        updateWidget(widget.id, {
          config: { ...config, activeDriveFileId: fileId, setName: fileName },
        });
      }

      await showAlert('Practice set saved successfully!', {
        variant: 'info',
        title: 'Saved',
      });
      void fetchDriveFiles(); // Refresh list
    } catch (error) {
      console.error('[RevealGrid] Save error:', error);
      await showAlert('Failed to save to Drive.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handlePasteData = () => {
    if (!pasteData.trim()) return;
    const lines = pasteData.split('\n');
    const newCards = lines
      .map((line) => {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          return {
            id: crypto.randomUUID(),
            frontContent: parts[0].trim(),
            backContent: parts[1].trim(),
            isRevealed: false,
          } as RevealCard;
        }
        return null;
      })
      .filter((card): card is RevealCard => card !== null);

    if (newCards.length > 0) {
      updateCards([...cards, ...newCards]);
      setPasteData('');
      setIsPasting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const csvData = event.target?.result as string;
      if (!csvData) return;

      const lines = csvData.split('\n');
      const newCards = lines
        .map((line) => {
          // Robust CSV parsing to handle commas inside quotes
          const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          if (parts.length >= 2) {
            return {
              id: crypto.randomUUID(),
              frontContent: parts[0].replace(/^"|"$/g, '').trim(),
              backContent: parts[1].replace(/^"|"$/g, '').trim(),
              isRevealed: false,
            } as RevealCard;
          }
          return null;
        })
        .filter((card): card is RevealCard => card !== null);

      if (newCards.length > 0) {
        updateCards([...cards, ...newCards]);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleLoadFromDrive = async (fileId: string) => {
    if (!driveService) return;
    try {
      setIsLoadingDrive(true);
      const contentStr = await (await driveService.downloadFile(fileId)).text();
      const parsed = JSON.parse(contentStr) as Partial<RevealGridConfig>;

      updateWidget(widget.id, {
        config: {
          ...config,
          cards: parsed.cards ?? [],
          columns: parsed.columns ?? 3,
          revealMode: parsed.revealMode ?? 'flip',
          activeDriveFileId: fileId,
          setName:
            parsed.setName ??
            existingFiles.find((f) => f.id === fileId)?.name ??
            'Loaded Set',
        },
      });
      await showAlert('Practice set loaded successfully!', {
        variant: 'info',
        title: 'Loaded',
      });
    } catch (error) {
      console.error('[RevealGrid] Load error:', error);
      await showAlert('Failed to load from Drive.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleShareUrl = async () => {
    if (!config.activeDriveFileId || !driveService) {
      await showAlert('Please save the set to Drive first before sharing.', {
        variant: 'info',
        title: 'Save Required',
      });
      return;
    }

    try {
      setIsLoadingDrive(true);
      const url = await driveService.getShareableLink(config.activeDriveFileId);
      await navigator.clipboard.writeText(url);
      await showAlert('Share link copied to clipboard!', {
        variant: 'info',
        title: 'Copied',
      });
    } catch (error) {
      console.error('[RevealGrid] Share error:', error);
      await showAlert('Failed to get share link.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const updateCards = (updated: RevealCard[]) => {
    updateWidget(widget.id, { config: { ...config, cards: updated } });
  };

  const addCard = () => {
    const newCard: RevealCard = {
      id: crypto.randomUUID(),
      frontContent: '',
      backContent: '',
      isRevealed: false,
    };
    const updated = [...cards, newCard];
    updateCards(updated);
    setExpandedId(newCard.id);
  };

  const deleteCard = (id: string) => {
    updateCards(cards.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const updateCardField = (
    id: string,
    field: 'frontContent' | 'backContent',
    value: string
  ) => {
    updateCards(cards.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  return (
    <div className="space-y-6">
      {/* Columns */}
      <div>
        <SettingsLabel>Columns</SettingsLabel>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {([2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, columns: n },
                })
              }
              className={`flex-1 py-1.5 text-xxs font-black rounded-lg transition-all ${
                columns === n
                  ? 'bg-white shadow-sm text-slate-800'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Game Mode */}
      <div>
        <SettingsLabel>Game Mode</SettingsLabel>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() =>
              updateWidget(widget.id, {
                config: { ...config, isMemoryMode: false },
              })
            }
            className={`flex-1 py-1.5 text-xxs font-black uppercase rounded-lg transition-all ${
              !config.isMemoryMode
                ? 'bg-white shadow-sm text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Review
          </button>
          <button
            type="button"
            onClick={() =>
              updateWidget(widget.id, {
                config: { ...config, isMemoryMode: true },
              })
            }
            className={`flex-1 py-1.5 text-xxs font-black uppercase rounded-lg transition-all ${
              config.isMemoryMode
                ? 'bg-white shadow-sm text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Memory
          </button>
        </div>
        {config.isMemoryMode && (
          <p className="text-xs text-slate-500 mt-2">
            In Memory mode, the grid acts as a matching game. Terms and
            definitions are hidden on the back of cards and randomly shuffled.
          </p>
        )}
      </div>

      {/* Reveal Mode */}
      <div>
        <SettingsLabel>Reveal Mode</SettingsLabel>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {(['flip', 'fade'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, revealMode: mode },
                })
              }
              className={`flex-1 py-1.5 text-xxs font-black uppercase rounded-lg transition-all ${
                (config.revealMode ?? 'flip') === mode
                  ? 'bg-white shadow-sm text-slate-800'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Practice Set Management */}
      <div className="space-y-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
        <SettingsLabel>Practice Set</SettingsLabel>

        <div>
          <label className="text-xxxs font-black text-slate-400 uppercase tracking-widest block mb-1">
            Set Name
          </label>
          <input
            type="text"
            value={config.setName ?? ''}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: { ...config, setName: e.target.value },
              })
            }
            placeholder="e.g. Biology Ch 4"
            className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSaveToDrive}
            disabled={isLoadingDrive || !driveService}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors text-xs font-bold disabled:opacity-50"
          >
            {isLoadingDrive ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save to Drive
          </button>

          <button
            onClick={handleShareUrl}
            disabled={!config.activeDriveFileId}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-xs font-bold disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            Share URL
          </button>
        </div>

        {existingFiles.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <label className="text-xxxs font-black text-slate-400 uppercase tracking-widest block mb-2 flex items-center gap-1">
              <FolderOpen className="w-3 h-3" /> Load Existing Set
            </label>
            <div className="relative">
              <select
                onChange={(e) => handleLoadFromDrive(e.target.value)}
                value=""
                className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>
                  Select a saved set...
                </option>
                {existingFiles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        <SettingsLabel>Cards ({cards.length})</SettingsLabel>

        {/* Easier Card Creation Tools */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setIsPasting(!isPasting)}
            className="flex items-center justify-center gap-2 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-xs font-bold"
          >
            <ClipboardType className="w-4 h-4" /> Paste from Sheet
          </button>

          <label className="flex items-center justify-center gap-2 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-xs font-bold cursor-pointer">
            <Upload className="w-4 h-4" /> Upload CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>

          <button
            type="button"
            className="col-span-2 flex items-center justify-center gap-2 py-2 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-colors text-xs font-bold"
          >
            <Sparkles className="w-4 h-4" /> Reveal Grid Set Generator
          </button>
        </div>

        {isPasting && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl mb-4">
            <label className="text-xxxs font-black text-blue-400 uppercase tracking-widest block mb-2">
              Paste two columns (Term, Definition)
            </label>
            <textarea
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
              className="w-full h-24 text-xs p-2 rounded border border-blue-200 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste rows here..."
            />
            <button
              onClick={handlePasteData}
              className="w-full py-2 bg-blue-500 text-white rounded font-bold text-xs"
            >
              Add Cards
            </button>
          </div>
        )}

        {cards.map((card, i) => (
          <div
            key={card.id}
            className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-xxxs font-black text-slate-400 uppercase w-5 shrink-0">
                {i + 1}
              </span>
              <span className="flex-1 text-xxs text-slate-700 truncate">
                {card.frontContent || (
                  <span className="italic text-slate-400">Empty card</span>
                )}
              </span>
              <button
                type="button"
                onClick={() =>
                  setExpandedId(expandedId === card.id ? null : card.id)
                }
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                {expandedId === card.id ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
              <button
                type="button"
                onClick={() => deleteCard(card.id)}
                className="text-slate-300 hover:text-red-500 p-1 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {expandedId === card.id && (
              <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2 animate-in fade-in slide-in-from-top-1">
                <div>
                  <label className="text-xxxs font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Front (Question / Term)
                  </label>
                  <input
                    type="text"
                    value={card.frontContent}
                    onChange={(e) =>
                      updateCardField(card.id, 'frontContent', e.target.value)
                    }
                    placeholder="e.g. Photosynthesis"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xxxs font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Back (Answer / Definition)
                  </label>
                  <input
                    type="text"
                    value={card.backContent}
                    onChange={(e) =>
                      updateCardField(card.id, 'backContent', e.target.value)
                    }
                    placeholder="e.g. Converting sunlight to energy"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addCard}
          className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-all flex items-center justify-center gap-2 text-xxs uppercase"
        >
          <Plus className="w-4 h-4" /> Add Card
        </button>
      </div>
    </div>
  );
};

export const RevealGridAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as RevealGridConfig;

  return (
    <div className="space-y-6">
      {/* Font Family */}
      <div>
        <SettingsLabel>Font Family</SettingsLabel>
        <select
          value={config.fontFamily ?? 'global'}
          onChange={(e) =>
            updateWidget(widget.id, {
              config: {
                ...config,
                fontFamily:
                  e.target.value === 'global'
                    ? undefined
                    : (e.target.value as GlobalFontFamily),
              },
            })
          }
          className="w-full p-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="global">Use Dashboard Default</option>
          <option value="sans">Sans Serif</option>
          <option value="serif">Serif</option>
          <option value="mono">Monospace</option>
          <option value="comic">Comic</option>
          <option value="handwritten">Handwritten</option>
          <option value="rounded">Rounded</option>
          <option value="fun">Fun</option>
          <option value="slab">Slab</option>
          <option value="retro">Retro</option>
          <option value="marker">Marker</option>
        </select>
      </div>

      {/* Default Card Colors */}
      <div className="space-y-4">
        <div>
          <SettingsLabel>Default Card Front Color</SettingsLabel>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">
                Applied to all new cards (per-card colors override this)
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {config.defaultCardColor ?? '#dbeafe'}
              </span>
            </div>
            <input
              type="color"
              value={config.defaultCardColor ?? '#dbeafe'}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: { ...config, defaultCardColor: e.target.value },
                })
              }
              className="w-full h-8 rounded cursor-pointer border border-slate-200"
            />
          </div>
        </div>

        <div>
          <SettingsLabel>Default Card Back Color</SettingsLabel>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">
                Background color for revealed cards
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {config.defaultCardBackColor ?? '#dcfce7'}
              </span>
            </div>
            <input
              type="color"
              value={config.defaultCardBackColor ?? '#dcfce7'}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: { ...config, defaultCardBackColor: e.target.value },
                })
              }
              className="w-full h-8 rounded cursor-pointer border border-slate-200"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
