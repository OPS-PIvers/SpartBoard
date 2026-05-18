import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Loader2, Layout, Folder } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { db, isAuthBypass } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { hydrateCollectionTemplate } from '@/utils/collectionTemplateHydration';
import {
  AnyTemplate,
  Dashboard,
  DEFAULT_GLOBAL_STYLE,
  isCollectionTemplate,
  DashboardTemplate,
} from '@/types';
import { logError } from '@/utils/logError';
import { mockTemplateStore } from '@/hooks/useTemplateStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const TEMPLATES_COLLECTION = 'dashboard_templates';

export const CreateFromTemplateModal: React.FC<Props> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { collectionsApi, dashboards, createNewDashboard, addToast } =
    useDashboard();
  const { createCollection, setCollectionDefaultBoard, deleteCollection } =
    collectionsApi;
  const [templates, setTemplates] = useState<AnyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (isAuthBypass) {
      // In auth-bypass / E2E mode, read from the in-memory mock store.
      // Defensive filter matches production: only show enabled templates.
      const all = mockTemplateStore.getAll().filter((tpl) => tpl.enabled);
      setTemplates(all);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, TEMPLATES_COLLECTION),
      where('enabled', '==', true)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map(
          (d) => ({ ...(d.data() as AnyTemplate), id: d.id }) as AnyTemplate
        );
        // Defensive: drop any docs that snuck through with enabled:false
        // (rule changes, race conditions) so we never instantiate a
        // disabled template.
        setTemplates(all.filter((tpl) => tpl.enabled));
        setLoading(false);
        setErrored(false);
      },
      (err) => {
        logError('CreateFromTemplateModal.subscribe', err);
        setErrored(true);
        setLoading(false);
      }
    );
    return unsub;
  }, [isOpen]);

  const baseOrder = dashboards.reduce(
    (max, d) => Math.max(max, d.order ?? 0),
    0
  );

  const pickBoardTemplate = useCallback(
    async (tpl: DashboardTemplate) => {
      setBusyTemplateId(tpl.id);
      try {
        // Board templates land at root with no collectionId. Spread the
        // template's widgets/style/background into the new Dashboard.
        // Merge Partial<GlobalStyle> with DEFAULT_GLOBAL_STYLE so the resulting
        // Dashboard.globalStyle always satisfies the full GlobalStyle type.
        const dashboard = {
          id: crypto.randomUUID(),
          name: tpl.name,
          background: tpl.background ?? 'bg-slate-900',
          widgets: tpl.widgets,
          createdAt: Date.now(),
          order: baseOrder + 1,
          ...(tpl.globalStyle !== undefined && {
            globalStyle: { ...DEFAULT_GLOBAL_STYLE, ...tpl.globalStyle },
          }),
        } as Dashboard;
        await createNewDashboard(tpl.name, dashboard);
        onClose();
      } catch (err) {
        logError('CreateFromTemplateModal.pickBoard', err, {
          templateId: tpl.id,
        });
      } finally {
        setBusyTemplateId(null);
      }
    },
    [baseOrder, createNewDashboard, onClose]
  );

  const pickCollectionTemplate = useCallback(
    async (tpl: Extract<AnyTemplate, { type: 'collection' }>) => {
      setBusyTemplateId(tpl.id);
      try {
        const { collectionInput, boardInputs, defaultBoardId } =
          hydrateCollectionTemplate(tpl, { existingMaxOrder: baseOrder });
        const newCollectionId = await createCollection(
          collectionInput.name,
          collectionInput.parentCollectionId
        );

        // Fan out Board creation sequentially under the new Collection.
        // Sequential (not parallel) so the order field translates 1:1 to
        // sidebar position without ordering races between concurrent
        // createNewDashboard calls. Track per-Board success so we can
        // roll back if every Board creation fails (same rollback strategy
        // used elsewhere in the codebase for multi-step collection writes).
        let succeeded = 0;
        for (const board of boardInputs) {
          try {
            await createNewDashboard(board.name, board, {
              collectionId: newCollectionId,
              silent: true,
            });
            succeeded += 1;
          } catch (boardErr) {
            logError('CreateFromTemplateModal.boardCreate', boardErr, {
              templateId: tpl.id,
              boardName: board.name,
            });
          }
        }

        if (succeeded === 0) {
          // Every Board creation failed — remove the empty Collection shell
          // rather than leaving a stale entry in the user's sidebar.
          try {
            await deleteCollection(newCollectionId, 'delete-all');
          } catch (cleanupErr) {
            logError('CreateFromTemplateModal.rollback', cleanupErr, {
              newCollectionId,
            });
          }
          return;
        }

        if (succeeded < boardInputs.length) {
          const missing = boardInputs.length - succeeded;
          addToast(
            `Template applied — but ${missing.toString()} board(s) couldn't be created. Add them manually.`,
            'error'
          );
          // Continue — the Collection + partial boards are still useful.
        }

        if (defaultBoardId !== null) {
          await setCollectionDefaultBoard(newCollectionId, defaultBoardId);
        }
        onClose();
      } catch (err) {
        logError('CreateFromTemplateModal.pickCollection', err, {
          templateId: tpl.id,
        });
      } finally {
        setBusyTemplateId(null);
      }
    },
    [
      addToast,
      baseOrder,
      createCollection,
      createNewDashboard,
      deleteCollection,
      setCollectionDefaultBoard,
      onClose,
    ]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('templatePicker.title', {
        defaultValue: 'Create from Template',
      })}
      maxWidth="max-w-xl"
      zIndex="z-modal-deep"
    >
      <div className="space-y-3 p-1">
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('templatePicker.loading', {
              defaultValue: 'Loading templates…',
            })}
          </div>
        )}
        {!loading && errored && (
          <p className="text-sm text-rose-300/80 italic">
            {t('templatePicker.loadError', {
              defaultValue: "Couldn't load templates — refresh to retry.",
            })}
          </p>
        )}
        {!loading && !errored && templates.length === 0 && (
          <p className="text-sm text-slate-500 italic">
            {t('templatePicker.empty', {
              defaultValue: 'No templates available yet.',
            })}
          </p>
        )}
        {!loading && !errored && templates.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {templates.map((tpl) => (
              <li key={tpl.id} className="py-2 flex items-center gap-3">
                {isCollectionTemplate(tpl) ? (
                  <Folder className="w-5 h-5 text-brand-blue-primary" />
                ) : (
                  <Layout className="w-5 h-5 text-brand-blue-primary" />
                )}
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isCollectionTemplate(tpl)) {
                        void pickCollectionTemplate(tpl);
                      } else {
                        void pickBoardTemplate(tpl);
                      }
                    }}
                    disabled={busyTemplateId !== null}
                    className="text-left text-sm font-bold text-slate-800 hover:text-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {tpl.name}
                  </button>
                  <p className="text-xs text-slate-500">
                    {isCollectionTemplate(tpl)
                      ? t('templatePicker.kindCollection', {
                          count: tpl.boardSnapshots.length,
                          defaultValue: 'Collection · {{count}} board(s)',
                        })
                      : t('templatePicker.kindBoard', {
                          defaultValue: 'Board',
                        })}
                  </p>
                </div>
                {busyTemplateId === tpl.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
