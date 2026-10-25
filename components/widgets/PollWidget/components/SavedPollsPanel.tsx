import React from 'react';
import { Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  PollConfig,
  PollQuestion,
  SavedPollPreset,
  WidgetType,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { Button } from '@/components/common/Button';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { tourAttr } from '@/config/tourAnchors';

interface SavedPollsPanelProps {
  questions: PollQuestion[];
  hideResults: boolean;
  /** Loading is off while students are voting. */
  isLive: boolean;
  onLoad: (preset: SavedPollPreset) => void;
  widgetId: string;
  widgetType: WidgetType;
}

/** Save this poll's questions to reuse on any board, and load saved ones. */
export const SavedPollsPanel: React.FC<SavedPollsPanelProps> = ({
  questions,
  hideResults,
  isLive,
  onLoad,
  widgetId,
  widgetType,
}) => {
  const { t } = useTranslation();
  const { savedWidgetPresets, saveWidgetPreset } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm, showPrompt } = useDialog();

  const savedLibrary: SavedPollPreset[] =
    (savedWidgetPresets.poll as Partial<PollConfig> | undefined)
      ?.savedLibrary ?? [];

  const handleSave = async () => {
    const name = await showPrompt(t('widgetSettings.poll.savePollPrompt'), {
      title: t('widgetSettings.poll.savePoll'),
      placeholder: questions[0]?.question || undefined,
      confirmLabel: t('widgetSettings.poll.save'),
    });
    if (!name?.trim()) return;
    const preset: SavedPollPreset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      questions: questions.map((q) => ({
        ...q,
        options: q.options.map((o) => ({ ...o, votes: 0 })),
      })),
      hideResults,
      createdAt: Date.now(),
    };
    saveWidgetPreset('poll', { savedLibrary: [...savedLibrary, preset] });
    addToast(
      t('widgetSettings.poll.pollSaved', { name: preset.name }),
      'success'
    );
  };

  const handleLoad = async (preset: SavedPollPreset) => {
    const ok = await showConfirm(t('widgetSettings.poll.loadPollConfirm'), {
      title: t('widgetSettings.poll.loadPollTitle', { name: preset.name }),
      confirmLabel: t('widgetSettings.poll.load'),
    });
    if (!ok) return;
    onLoad(preset);
  };

  const handleDelete = async (preset: SavedPollPreset) => {
    const ok = await showConfirm(t('widgetSettings.poll.deletePollConfirm'), {
      title: t('widgetSettings.poll.deletePollTitle', { name: preset.name }),
      confirmLabel: t('widgetSettings.poll.delete'),
      variant: 'danger',
    });
    if (!ok) return;
    saveWidgetPreset('poll', {
      savedLibrary: savedLibrary.filter((p) => p.id !== preset.id),
    });
  };

  return (
    <div className="pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between gap-3 mb-2">
        <SettingsLabel as="span" className="mb-0">
          {t('widgetSettings.poll.savedPolls')}
        </SettingsLabel>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void handleSave()}
          icon={<Save className="w-3.5 h-3.5" />}
          {...tourAttr('widget-settings.poll.save-poll', widgetId, widgetType)}
        >
          {t('widgetSettings.poll.savePoll')}
        </Button>
      </div>
      {savedLibrary.length === 0 ? (
        <p className="text-xs text-slate-400">
          {t('widgetSettings.poll.noSavedPolls')}
        </p>
      ) : (
        <ul
          className="divide-y divide-slate-100 border-y border-slate-100"
          {...tourAttr(
            'widget-settings.poll.saved-polls',
            widgetId,
            widgetType
          )}
        >
          {savedLibrary.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5">
              <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 [overflow-wrap:anywhere]">
                {p.name}
              </span>
              <span className="shrink-0 text-xxs text-slate-400 tabular-nums">
                {t('widgetSettings.poll.questionCount', {
                  count: p.questions.length,
                })}
              </span>
              <button // no-tour-anchor: one per saved poll, tours point at the list
                type="button"
                onClick={() => void handleLoad(p)}
                disabled={isLive}
                title={isLive ? t('widgetSettings.poll.stopToEdit') : undefined}
                aria-label={t('widgetSettings.poll.loadPollNamed', {
                  name: p.name,
                })}
                className="relative touch-target-expand shrink-0 px-1 text-xxs font-bold text-brand-blue-primary hover:underline disabled:text-slate-400 disabled:no-underline"
              >
                {t('widgetSettings.poll.load')}
              </button>
              <button // no-tour-anchor: one per saved poll, tours point at the list
                type="button"
                onClick={() => void handleDelete(p)}
                aria-label={t('widgetSettings.poll.deletePollNamed', {
                  name: p.name,
                })}
                className="relative touch-target-expand shrink-0 p-1 text-slate-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
