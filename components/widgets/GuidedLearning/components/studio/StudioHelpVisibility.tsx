import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { CheckCircle2, Eye } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useHelpResources } from '@/hooks/useHelpResources';
import { isSuperAdminActor } from '@/utils/superAdmin';
import { logError } from '@/utils/logError';
import {
  buildVisibilityPayload,
  HELP_RESOURCES_COLLECTION,
} from '@/components/admin/HelpCenter/helpCenterAdmin';

/** Whether teachers can find this Help Center tour in Help, with a one-click Show in Help. */
export const StudioHelpVisibility: React.FC<{
  setId: string;
  published: boolean;
}> = ({ setId, published }) => {
  const { t } = useTranslation();
  const { user, userRoles, orgId, roleId } = useAuth();
  const isSuperAdmin = isSuperAdminActor(
    user?.email,
    userRoles?.superAdmins,
    roleId,
    orgId
  );
  const { items, loading } = useHelpResources({
    includeHidden: true,
    allOrgs: isSuperAdmin,
  });
  const [showing, setShowing] = useState(false);
  const [failed, setFailed] = useState(false);

  if (loading) return null;
  const linked = items.filter(
    (item) => item.kind === 'guided-learning' && item.setId === setId
  );
  const hidden = linked.filter((item) => !item.visible);

  const showInHelp = async () => {
    setShowing(true);
    setFailed(false);
    try {
      await Promise.all(
        hidden.map((item) =>
          updateDoc(
            doc(db, HELP_RESOURCES_COLLECTION, item.id),
            buildVisibilityPayload(true)
          )
        )
      );
    } catch (err) {
      logError('StudioHelpVisibility', err, { setId });
      setFailed(true);
    } finally {
      setShowing(false);
    }
  };

  if (linked.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        {t('glStudio.tourPublish.help_none')}
      </p>
    );
  }
  if (hidden.length === 0) {
    return (
      <p className="flex items-center gap-1 text-xs font-bold text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t('glStudio.tourPublish.help_shown')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-amber-800">
        {t(
          published
            ? 'glStudio.tourPublish.help_hidden'
            : 'glStudio.tourPublish.help_hiddenDraft'
        )}
      </p>
      {published && (
        <button
          type="button"
          onClick={() => void showInHelp()}
          disabled={showing}
          className="flex items-center gap-1.5 self-start rounded-lg border border-brand-blue-primary bg-white px-3 py-1.5 text-xs font-bold text-brand-blue-primary hover:bg-blue-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {showing
            ? t('glStudio.tourPublish.help_showing')
            : t('glStudio.tourPublish.help_show')}
        </button>
      )}
      {failed && (
        <p role="alert" className="text-xs font-bold text-brand-red-primary">
          {t('glStudio.tourPublish.help_showFailed')}
        </p>
      )}
    </div>
  );
};
