import React from 'react';
import { CloudOff, Loader2 } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { VIEW_AS_DRIVE_UNAVAILABLE } from '@/utils/viewAsDrive';
import type { ViewAsDriveStatus } from '@/utils/viewAsDrive';

/** Widget body for a View as tab that has no Drive token. */
export const ViewAsDriveEmptyState: React.FC<{ status: ViewAsDriveStatus }> = ({
  status,
}) =>
  status === 'unavailable' ? (
    <ScaledEmptyState icon={CloudOff} title={VIEW_AS_DRIVE_UNAVAILABLE} />
  ) : (
    <div className="flex items-center justify-center h-full text-slate-400">
      <Loader2
        className="animate-spin"
        aria-label="Loading"
        style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
      />
    </div>
  );
