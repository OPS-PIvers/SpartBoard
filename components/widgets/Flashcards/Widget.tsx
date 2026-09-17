import React, { useCallback, useMemo, useState } from 'react';
import { LogIn } from 'lucide-react';
import type {
  FlashcardCard,
  FlashcardSet,
  FlashcardsConfig,
  WidgetData,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useFlashcardSets } from '@/hooks/useFlashcardSets';
import { useFolders } from '@/hooks/useFolders';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ImportWizard } from '@/components/common/library/importer';
import { FlashcardEditor } from './FlashcardEditor';
import { FlashcardLibrary } from './FlashcardLibrary';
import { createFlashcardImportAdapter } from './adapters/flashcardImportAdapter';

const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

const makeSet = (cards: FlashcardCard[] = []): FlashcardSet => {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    termLanguage: 'en-US',
    definitionLanguage: 'en-US',
    cards,
    folderId: null,
    createdAt: now,
    updatedAt: now,
  };
};

const extractSheetId = (url: string): string | null => {
  const match = url.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
};

export const FlashcardsWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as FlashcardsConfig;
  const { user, ensureGoogleScope } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const { openPicker } = useGooglePicker();
  const flashcardSets = useFlashcardSets(user?.uid);
  const folders = useFolders(user?.uid, 'flashcards');
  const [editingSet, setEditingSet] = useState<FlashcardSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const pickSheet = useCallback(async (): Promise<{ url: string } | null> => {
    const token = await ensureGoogleScope('drive.file', { interactive: true });
    if (!token) throw new Error('Google Drive access is required.');
    const picked = await openPicker({ mode: 'sheets', token });
    return picked
      ? { url: `https://docs.google.com/spreadsheets/d/${picked.id}/edit` }
      : null;
  }, [ensureGoogleScope, openPicker]);

  const loadSheet = useCallback(
    async (url: string): Promise<string[][]> => {
      const sheetId = extractSheetId(url);
      if (!sheetId) throw new Error('Choose a valid Google Sheet.');
      const token = await ensureGoogleScope('drive.file', {
        interactive: true,
      });
      if (!token) throw new Error('Google Drive access is required.');
      const response = await fetch(
        `${SHEETS_API_URL}/${sheetId}/values/${encodeURIComponent('A:B')}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            'The selected Sheet could not be read. Choose it again to grant access.'
          );
        }
        if (response.status === 404) throw new Error('Google Sheet not found.');
        throw new Error(`Google Sheet import failed (${response.status}).`);
      }
      const payload = (await response.json()) as {
        values?: Array<Array<string | number | boolean | null>>;
      };
      return (payload.values ?? []).map((row) =>
        row.map((value) => (value === null ? '' : String(value)))
      );
    },
    [ensureGoogleScope]
  );

  const saveImportedSet = useCallback(
    async (cards: FlashcardCard[], title: string): Promise<void> => {
      const imported = { ...makeSet(cards), title: title.trim() };
      await flashcardSets.saveSet(imported);
    },
    [flashcardSets]
  );

  const importAdapter = useMemo(
    () =>
      createFlashcardImportAdapter({
        loadSheet,
        pickSheet,
        save: saveImportedSet,
      }),
    [loadSheet, pickSheet, saveImportedSet]
  );

  const handleSave = async (set: FlashcardSet): Promise<void> => {
    setSaving(true);
    try {
      await flashcardSets.saveSet(set);
      setEditingSet(null);
      addToast(`“${set.title}” saved.`, 'success');
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : 'Flashcard set could not be saved.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (set: FlashcardSet): Promise<void> => {
    const confirmed = await showConfirm(
      `Delete “${set.title}”? This cannot be undone.`,
      {
        title: 'Delete flashcard set',
        variant: 'danger',
        confirmLabel: 'Delete',
      }
    );
    if (!confirmed) return;
    try {
      await flashcardSets.deleteSet(set.id);
      addToast(`“${set.title}” deleted.`, 'success');
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : 'Flashcard set could not be deleted.',
        'error'
      );
    }
  };

  if (!user) {
    return (
      <ScaledEmptyState
        icon={LogIn}
        title="Sign in required"
        subtitle="Sign in to build and save flashcard sets."
      />
    );
  }

  return (
    <>
      <WidgetLayout
        padding="p-0"
        contentClassName="flex-1 min-h-0"
        content={
          <div
            className="h-full w-full bg-transparent"
            data-flashcards-view={config.view ?? 'library'}
          >
            {editingSet ? (
              <FlashcardEditor
                key={editingSet.id}
                initialSet={editingSet}
                saving={saving}
                onCancel={() => setEditingSet(null)}
                onSave={handleSave}
              />
            ) : (
              <FlashcardLibrary
                sets={flashcardSets.sets}
                loading={flashcardSets.loading}
                error={flashcardSets.error}
                folders={folders}
                onNew={() => setEditingSet(makeSet())}
                onImport={() => setImportOpen(true)}
                onEdit={setEditingSet}
                onDelete={(set) => void handleDelete(set)}
              />
            )}
          </div>
        }
      />

      <ImportWizard
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        adapter={importAdapter}
        onSaved={(title) => {
          addToast(`“${title}” imported.`, 'success');
          setImportOpen(false);
        }}
      />
    </>
  );
};
