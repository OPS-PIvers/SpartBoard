import React from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/** The one offline notice every student app shows while the device has no connection. */
export const StudentOfflineBanner: React.FC<{ hidden?: boolean }> = ({
  hidden = false,
}) => {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  if (online || hidden) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-toast flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <div className="flex max-w-md items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-lg">
        <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t('studentOffline.banner')}</span>
      </div>
    </div>
  );
};
