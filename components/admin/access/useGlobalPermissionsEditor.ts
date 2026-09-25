import { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import type { GlobalFeature, GlobalFeaturePermission } from '@/types';

/** Features with an AI daily usage limit. */
export const GEMINI_FEATURES: GlobalFeature[] = [
  'gemini-functions',
  'smart-poll',
  'embed-mini-app',
  'video-activity-audio-transcription',
  'ai-file-context',
];

export const defaultDailyLimit = (featureId: GlobalFeature): number =>
  featureId === 'video-activity-audio-transcription' ? 5 : 20;

export type AdminMessage = { type: 'success' | 'error'; text: string };

/** Load, edit and save `global_permissions/*` docs for an admin page. */
export const useGlobalPermissionsEditor = () => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<
    Map<string, GlobalFeaturePermission>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [unsavedChanges, setUnsavedChanges] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<AdminMessage | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    const timeoutId = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'global_permissions'))
      .then((snapshot) => {
        if (cancelled) return;
        const permMap = new Map<string, GlobalFeaturePermission>();
        snapshot.forEach((d) => {
          const data = d.data() as GlobalFeaturePermission;
          permMap.set(data.featureId, data);
        });
        setPermissions(permMap);
      })
      .catch((error: unknown) => {
        console.error('Error loading global permissions:', error);
        if (!cancelled) showMessage('error', 'Failed to load permissions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showMessage]);

  const getPermission = useCallback(
    (featureId: GlobalFeature): GlobalFeaturePermission => {
      const defaults = FEATURE_DEFAULTS[featureId];
      return (
        permissions.get(featureId) ?? {
          featureId,
          accessLevel: defaults.defaultAccessLevel,
          betaUsers: [],
          enabled: defaults.defaultEnabled,
          buildings: [],
          // Show the in-code tier floor the runtime already enforces on a missing doc.
          ...(defaults.defaultMinTier
            ? { minTier: defaults.defaultMinTier }
            : {}),
          config: GEMINI_FEATURES.includes(featureId)
            ? {
                dailyLimit: defaultDailyLimit(featureId),
                dailyLimitEnabled: true,
              }
            : {},
        }
      );
    },
    [permissions]
  );

  const isSaved = useCallback(
    (featureId: GlobalFeature) => permissions.has(featureId),
    [permissions]
  );

  const updatePermission = useCallback(
    (featureId: GlobalFeature, updates: Partial<GlobalFeaturePermission>) => {
      // Functional update so several changes in one tick all merge.
      setPermissions((prev) => {
        const current = prev.get(featureId) ?? getPermission(featureId);
        return new Map(prev).set(featureId, { ...current, ...updates });
      });
      setUnsavedChanges((prev) => new Set(prev).add(featureId));
    },
    [getPermission]
  );

  const savePermission = async (featureId: GlobalFeature) => {
    try {
      setSaving((prev) => new Set(prev).add(featureId));
      const permission = getPermission(featureId);
      // Firestore rejects `undefined`; "no minimum tier" is an absent field.
      const { minTier, ...withoutMinTier } = permission;
      await setDoc(
        doc(db, 'global_permissions', featureId),
        minTier === undefined ? withoutMinTier : permission
      );

      if (
        featureId === 'gemini-functions' &&
        (permission.config?.advancedModel || permission.config?.standardModel)
      ) {
        try {
          await addDoc(collection(db, 'admin_audit_log'), {
            action: 'model_config_change',
            email: user?.email ?? '(unknown)',
            timestamp: serverTimestamp(),
            advancedModel:
              (permission.config?.advancedModel as string) || '(default)',
            standardModel:
              (permission.config?.standardModel as string) || '(default)',
          });
        } catch (auditErr) {
          // Non-blocking: the save succeeded; only the audit trail is missing.
          logError(
            'GlobalPermissionsManager.savePermission.auditLog',
            auditErr,
            { featureId, email: user?.email ?? null }
          );
        }
      }

      setUnsavedChanges((prev) => {
        const next = new Set(prev);
        next.delete(featureId);
        return next;
      });
      showMessage('success', `Saved ${FEATURE_DEFAULTS[featureId].label}`);
    } catch (error) {
      console.error('Error saving permission:', error);
      showMessage(
        'error',
        `Failed to save ${FEATURE_DEFAULTS[featureId].label}`
      );
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(featureId);
        return next;
      });
    }
  };

  return {
    permissions,
    loading,
    saving,
    unsavedChanges,
    message,
    setMessage,
    showMessage,
    getPermission,
    isSaved,
    updatePermission,
    savePermission,
  };
};
