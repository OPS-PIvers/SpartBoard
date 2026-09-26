import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { RevealCard, RevealGridConfig } from '@/types';
import {
  ChevronDown,
  ChevronUp,
  ClipboardType,
  FolderOpen,
  Loader2,
  Plus,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500';

const isRevealCard = (value: unknown): value is RevealCard => {
  if (!value || typeof value !== 'object') return false;
  const card = value as Partial<RevealCard>;
  return (
    typeof card.id === 'string' &&
    typeof card.frontContent === 'string' &&
    typeof card.backContent === 'string'
  );
};

const isColumnCount = (value: unknown): value is RevealGridConfig['columns'] =>
  value === 2 || value === 3 || value === 4 || value === 5;

export const RevealGridCardsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { addToast } = useDashboard();
  const { driveService } = useGoogleDrive();
  const { showAlert } = useDialog();
  const config = ctx.config as unknown as RevealGridConfig;
  const cards = config.cards ?? [];
  const columns = config.columns ?? 3;
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [existingFiles, setExistingFiles] = useState<
    { id: string; name: string }[]
  >([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const t = (leaf: string) => ctx.t(`widgetSettings.reveal-grid.${leaf}`);

  const fetchDriveFiles = useCallback(async () => {
    if (!driveService) return;
    try {
      setIsLoadingDrive(true);
      const folderId = await driveService.getFolderPath('RevealGridSets');
      if (folderId) {
        setExistingFiles(
          await driveService.listFiles(
            `'${folderId}' in parents and trashed = false`
          )
        );
      }
    } catch (error) {
      console.error('[RevealGrid] Error fetching files:', error);
    } finally {
      setIsLoadingDrive(false);
    }
  }, [driveService]);

  useEffect(() => {
    if (driveService) void fetchDriveFiles();
  }, [driveService, fetchDriveFiles]);

  const updateCards = (nextCards: RevealCard[]) => {
    ctx.updateConfig({ cards: nextCards });
  };

  const handleSaveToDrive = async () => {
    if (!driveService) {
      await showAlert(t('driveNotConnected'), {
        variant: 'error',
        title: t('driveNotConnectedTitle'),
      });
      return;
    }

    try {
      setIsLoadingDrive(true);
      const fileName =
        config.setName ?? `Practice Set ${new Date().toLocaleDateString()}`;
      const content = JSON.stringify({
        cards,
        columns,
        revealMode: config.revealMode,
        setName: fileName,
      });
      let fileId = config.activeDriveFileId;
      if (fileId) {
        await driveService.updateFileContent(
          fileId,
          new Blob([content], { type: 'application/json' })
        );
      } else {
        const driveFile = await driveService.uploadFile(
          new Blob([content], { type: 'application/json' }),
          fileName,
          'RevealGridSets'
        );
        fileId = driveFile.id;
        ctx.updateConfig({ activeDriveFileId: fileId, setName: fileName });
      }
      await showAlert(t('saved'), { variant: 'info', title: t('savedTitle') });
      void fetchDriveFiles();
    } catch (error) {
      console.error('[RevealGrid] Save error:', error);
      await showAlert(t('saveFailed'), {
        variant: 'error',
        title: t('errorTitle'),
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleLoadFromDrive = async (fileId: string) => {
    if (!driveService) return;
    try {
      setIsLoadingDrive(true);
      const content = await (await driveService.downloadFile(fileId)).text();
      const parsed = JSON.parse(content) as Partial<RevealGridConfig>;
      const loadedCards = Array.isArray(parsed.cards)
        ? parsed.cards.filter(isRevealCard).map((card) => ({
            ...card,
            isRevealed: card.isRevealed === true,
          }))
        : [];
      const loadedColumns = isColumnCount(parsed.columns) ? parsed.columns : 3;
      const loadedRevealMode =
        parsed.revealMode === 'fade' ? 'fade' : ('flip' as const);
      const loadedName =
        typeof parsed.setName === 'string'
          ? parsed.setName
          : (existingFiles.find((file) => file.id === fileId)?.name ??
            'Loaded Set');
      ctx.updateConfig({
        cards: loadedCards,
        columns: loadedColumns,
        revealMode: loadedRevealMode,
        activeDriveFileId: fileId,
        setName: loadedName,
      });
      await showAlert(t('loaded'), {
        variant: 'info',
        title: t('loadedTitle'),
      });
    } catch (error) {
      console.error('[RevealGrid] Load error:', error);
      await showAlert(t('loadFailed'), {
        variant: 'error',
        title: t('errorTitle'),
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleShareUrl = async () => {
    if (!config.activeDriveFileId || !driveService) {
      await showAlert(t('saveBeforeShare'), {
        variant: 'info',
        title: t('saveRequiredTitle'),
      });
      return;
    }
    try {
      setIsLoadingDrive(true);
      const url = await driveService.getShareableLink(config.activeDriveFileId);
      await navigator.clipboard.writeText(url);
      await showAlert(t('shareCopied'), {
        variant: 'info',
        title: t('shareCopiedTitle'),
      });
    } catch (error) {
      console.error('[RevealGrid] Share error:', error);
      await showAlert(t('shareFailed'), {
        variant: 'error',
        title: t('errorTitle'),
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const addCard = () => {
    const card: RevealCard = {
      id: crypto.randomUUID(),
      frontContent: '',
      backContent: '',
      isRevealed: false,
    };
    updateCards([...cards, card]);
    setExpandedId(card.id);
  };

  const deleteCard = (id: string) => {
    updateCards(cards.filter((card) => card.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const updateCardField = (
    id: string,
    field: 'frontContent' | 'backContent',
    value: string
  ) => {
    updateCards(
      cards.map((card) => (card.id === id ? { ...card, [field]: value } : card))
    );
  };

  const handlePasteData = () => {
    if (!pasteData.trim()) return;
    const newCards = pasteData
      .split('\n')
      .map((line) => {
        const [frontContent, backContent] = line.split('\t');
        return frontContent && backContent
          ? ({
              id: crypto.randomUUID(),
              frontContent: frontContent.trim(),
              backContent: backContent.trim(),
              isRevealed: false,
            } satisfies RevealCard)
          : null;
      })
      .filter((card) => card !== null) as RevealCard[];
    if (newCards.length === 0) return;
    updateCards([...cards, ...newCards]);
    setPasteData('');
    setIsPasting(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const csvData = loadEvent.target?.result;
      if (typeof csvData !== 'string') return;
      const newCards = csvData
        .split('\n')
        .map((line) => {
          const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          if (parts.length < 2) return null;
          return {
            id: crypto.randomUUID(),
            frontContent: parts[0].replace(/^"|"$/g, '').trim(),
            backContent: parts[1].replace(/^"|"$/g, '').trim(),
            isRevealed: false,
          } satisfies RevealCard;
        })
        .filter((card) => card !== null) as RevealCard[];
      if (newCards.length > 0) updateCards([...cards, ...newCards]);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSaveToDrive}
            disabled={isLoadingDrive || !driveService}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 py-2 text-xs font-bold text-blue-600 disabled:opacity-50"
            {...tourAttr(
              'widget-settings.reveal-grid.save-drive',
              ctx.widget.id,
              ctx.widget.type
            )}
          >
            {isLoadingDrive ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t('saveToDrive')}
          </button>
          <button
            type="button"
            onClick={() => void handleShareUrl()}
            disabled={!config.activeDriveFileId || isLoadingDrive}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"
            {...tourAttr(
              'widget-settings.reveal-grid.share',
              ctx.widget.id,
              ctx.widget.type
            )}
          >
            <Share2 className="h-4 w-4" />
            {t('shareUrl')}
          </button>
        </div>
        {existingFiles.length > 0 && (
          <div className="border-t border-slate-200 pt-3">
            <label
              htmlFor={`${ctx.id}-load-set`}
              className="mb-1 flex items-center gap-1 text-xxs font-bold uppercase tracking-widest text-slate-400"
            >
              <FolderOpen className="h-3 w-3" /> {t('loadExistingSet')}
            </label>
            <select
              id={`${ctx.id}-load-set`}
              value=""
              onChange={(event) => void handleLoadFromDrive(event.target.value)}
              className={inputClass}
              {...tourAttr(
                'widget-settings.reveal-grid.load-set',
                ctx.widget.id,
                ctx.widget.type
              )}
            >
              <option value="" disabled>
                {t('selectSavedSet')}
              </option>
              {existingFiles.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setIsPasting((current) => !current)}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-600"
          {...tourAttr(
            'widget-settings.reveal-grid.paste',
            ctx.widget.id,
            ctx.widget.type
          )}
        >
          <ClipboardType className="h-4 w-4" /> {t('pasteFromSheet')}
        </button>
        <label
          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-600"
          {...tourAttr(
            'widget-settings.reveal-grid.upload-csv',
            ctx.widget.id,
            ctx.widget.type
          )}
        >
          <Upload className="h-4 w-4" /> {t('uploadCsv')}
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
        <button
          type="button"
          onClick={() => addToast(t('generatorComingSoon'), 'info')}
          className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-purple-50 py-2 text-xs font-bold text-purple-600"
          {...tourAttr(
            'widget-settings.reveal-grid.generator',
            ctx.widget.id,
            ctx.widget.type
          )}
        >
          <Sparkles className="h-4 w-4" /> {t('generator')}
        </button>
      </div>

      {isPasting && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <label
            htmlFor={`${ctx.id}-paste-data`}
            className="mb-1 block text-xxs font-bold uppercase tracking-widest text-blue-500"
          >
            {t('pasteColumns')}
          </label>
          <textarea
            id={`${ctx.id}-paste-data`}
            value={pasteData}
            onChange={(event) => setPasteData(event.target.value)}
            placeholder={t('pastePlaceholder')}
            rows={4}
            className="w-full rounded border border-blue-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handlePasteData}
            className="mt-2 w-full rounded bg-blue-500 py-2 text-xs font-bold text-white"
            {...tourAttr(
              'widget-settings.reveal-grid.add-pasted',
              ctx.widget.id,
              ctx.widget.type
            )}
          >
            {t('addCards')}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {cards.map((card, index) => (
          <div
            key={card.id}
            className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="w-5 shrink-0 text-xxs font-bold text-slate-400">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xxs text-slate-700">
                {card.frontContent || (
                  <span className="italic text-slate-400">
                    {t('emptyCard')}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={t('toggleCard')}
                onClick={() =>
                  setExpandedId(expandedId === card.id ? null : card.id)
                }
                className="p-1 text-slate-400"
              >
                {expandedId === card.id ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
              <button
                type="button"
                aria-label={t('removeCard')}
                onClick={() => deleteCard(card.id)}
                className="p-1 text-slate-300 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {expandedId === card.id && (
              <div className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2">
                <div>
                  <label
                    htmlFor={`${ctx.id}-front-${card.id}`}
                    className="mb-1 block text-xxs font-bold uppercase tracking-widest text-slate-400"
                  >
                    {t('frontContent')}
                  </label>
                  <input
                    id={`${ctx.id}-front-${card.id}`}
                    type="text"
                    value={card.frontContent}
                    onChange={(event) =>
                      updateCardField(
                        card.id,
                        'frontContent',
                        event.target.value
                      )
                    }
                    placeholder={t('frontPlaceholder')}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${ctx.id}-back-${card.id}`}
                    className="mb-1 block text-xxs font-bold uppercase tracking-widest text-slate-400"
                  >
                    {t('backContent')}
                  </label>
                  <input
                    id={`${ctx.id}-back-${card.id}`}
                    type="text"
                    value={card.backContent}
                    onChange={(event) =>
                      updateCardField(
                        card.id,
                        'backContent',
                        event.target.value
                      )
                    }
                    placeholder={t('backPlaceholder')}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addCard}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-xxs font-bold uppercase text-slate-400 hover:border-blue-400 hover:text-blue-500"
          {...tourAttr(
            'widget-settings.reveal-grid.add-card',
            ctx.widget.id,
            ctx.widget.type
          )}
        >
          <Plus className="h-4 w-4" /> {t('addCard')}
        </button>
      </div>
    </div>
  );
};
