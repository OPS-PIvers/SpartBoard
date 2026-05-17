import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Loader2, Layout, Folder } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { db, isAuthBypass } from '@/config/firebase';
import { useCollections } from '@/hooks/useCollections';
import { useDashboard } from '@/context/useDashboard';
import { hydrateCollectionTemplate } from '@/utils/collectionTemplateHydration';
import {
  AnyTemplate,
  Dashboard,
  isCollectionTemplate,
  DashboardTemplate,
} from '@/types';
import { logError } from '@/utils/logError';

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
  // NOTE: useCollections is called without a userId here because this modal
  // only uses createCollection and setCollectionDefaultBoard — both of which
  // are called in response to explicit user actions inside a fully-authed
  // session. The DashboardContext exposes a shared collectionsApi instance but
  // the test-suite mocks useCollections directly, so we call it here to keep
  // the seam consistent with the mock boundary.
  const { createCollection, setCollectionDefaultBoard } =
    useCollections(undefined);
  const { dashboards, createNewDashboard } = useDashboard();
  const [templates, setTemplates] = useState<AnyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (isAuthBypass) {
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
    (max, d) => Math.max(max, (d as { order?: number }).order ?? 0),
    0
  );

  const pickBoardTemplate = useCallback(
    async (tpl: DashboardTemplate) => {
      setBusyTemplateId(tpl.id);
      try {
        // Board templates land at root with no collectionId. Spread the
        // template's widgets/style/background into the new Dashboard.
        // Cast via `as Dashboard` because DashboardTemplate.globalStyle is
        // Partial<GlobalStyle> while Dashboard.globalStyle expects GlobalStyle;
        // the runtime shape is identical — the Partial<> is a write-time
        // convenience type that shouldn't propagate to instantiated Dashboards.
        const dashboard = {
          id: crypto.randomUUID(),
          name: tpl.name,
          background: tpl.background ?? 'bg-slate-900',
          widgets: tpl.widgets,
          createdAt: Date.now(),
          order: baseOrder + 1,
          ...(tpl.globalStyle !== undefined && {
            globalStyle: tpl.globalStyle,
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
        // createNewDashboard calls.
        for (const board of boardInputs) {
          await createNewDashboard(board.name, board, {
            collectionId: newCollectionId,
            silent: true,
          });
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
      baseOrder,
      createCollection,
      createNewDashboard,
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
