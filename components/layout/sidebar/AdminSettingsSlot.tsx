import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { LazyChunkErrorBoundary } from '@/components/common/LazyChunkErrorBoundary';
import { Modal } from '@/components/common/Modal';
import { loadAdminSettings } from './adminSettingsLoader';
import type { AdminSettingsTabRequest } from '@/components/admin/AdminSettings';

// Lazy: AdminSettings pulls in recharts + the admin surface (~1.2MB) but only admins open it.
const AdminSettings = React.lazy(() =>
  loadAdminSettings().then((m) => ({ default: m.AdminSettings }))
);

const Spinner: React.FC<{ label: string }> = ({ label }) => (
  <div
    role="status"
    aria-label={label}
    className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/40"
  >
    <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
  </div>
);

export const AdminSettingsSlot: React.FC<{
  onClose: () => void;
  tabRequest?: AdminSettingsTabRequest;
}> = ({ onClose, tabRequest }) => {
  const { t } = useTranslation();
  const loadingLabel = t('sidebar.header.adminSettingsLoading');
  return (
    <LazyChunkErrorBoundary
      fallback={({ onRetry, updating }) =>
        updating ? (
          <Spinner label={loadingLabel} />
        ) : (
          <Modal
            isOpen
            onClose={onClose}
            variant="bare"
            ariaLabel={t('sidebar.header.adminSettingsLoadFailed')}
          >
            <div className="mx-auto flex w-fit flex-col items-center gap-4 rounded-xl bg-white px-6 py-5 text-slate-700 shadow-xl">
              <p className="text-sm font-medium">
                {t('sidebar.header.adminSettingsLoadFailed')}
              </p>
              <div className="flex justify-center gap-2">
                <button // no-tour-anchor: error fallback shown only when Admin Settings fails to load
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {t('common.close')}
                </button>
                <button // no-tour-anchor: error fallback shown only when Admin Settings fails to load
                  type="button"
                  onClick={onRetry}
                  className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-blue-dark"
                >
                  {t('sidebar.header.adminSettingsReload')}
                </button>
              </div>
            </div>
          </Modal>
        )
      }
    >
      <React.Suspense fallback={<Spinner label={loadingLabel} />}>
        <AdminSettings onClose={onClose} tabRequest={tabRequest} />
      </React.Suspense>
    </LazyChunkErrorBoundary>
  );
};
