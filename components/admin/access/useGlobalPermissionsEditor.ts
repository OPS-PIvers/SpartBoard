import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';
import {
  PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT,
  PAPER_HANDWRITTEN_FEATURE,
} from '@/utils/paperWritten';
import type { GlobalFeature, GlobalFeaturePermission } from '@/types';

/** Features with an AI daily usage limit. */
export const GEMINI_FEATURES: GlobalFeature[] = [
  'gemini-functions',
  'smart-poll',
  'embed-mini-app',
  'video-activity-audio-transcription',
  'ai-file-context',
  PAPER_HANDWRITTEN_FEATURE,
  'quiz',
  'video-activity-ai',
  'guided-learning-ai',
  'mini-app-ai',
  'drawing-ai',
  'webcam-ai',
  'blooms-ai',
];

/** Features whose admin card picks the Gemini model tier. */
export const MODEL_TIER_FEATURES: GlobalFeature[] = [PAPER_HANDWRITTEN_FEATURE];

export type AiModelTier = 'standard' | 'advanced';
export const DEFAULT_MODEL_TIER: AiModelTier = 'standard';

export const defaultDailyLimit = (featureId: GlobalFeature): number => {
  if (featureId === 'video-activity-audio-transcription') return 5;
  if (featureId === PAPER_HANDWRITTEN_FEATURE)
    return PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT;
  return 20;
};

/** Load, edit and save `global_permissions/*` docs for an admin page. */
export const useGlobalPermissionsEditor = () => {
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const [permissions, setPermissions] = useState<
    Map<string, GlobalFeaturePermission>
  >(new Map());
  // Last state read from or written to Firestore, for discarding unsaved edits.
  const [stored, setStored] = useState<Map<string, GlobalFeaturePermission>>(
    new Map()
  );
  // Written with every setStored so a discard from a stale closure sees fresh saves.
  const storedRef = useRef<Map<string, GlobalFeaturePermission>>(new Map());
  // Bumped per edit so a save can tell whether the user edited the feature while it was in flight.
  const editVersionsRef = useRef<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [unsavedChanges, setUnsavedChanges] = useState<Set<string>>(new Set());

  const showMessage = useCallback(
    (type: 'success' | 'error', text: string) => {
      addToast(text, type);
    },
    [addToast]
  );

  useEffect(() => {
    if (isAuthBypass) {
      setLoading(false);
      return;
    }
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
        storedRef.current = new Map(permMap);
        setStored(storedRef.current);
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
                ...(MODEL_TIER_FEATURES.includes(featureId)
                  ? { modelTier: DEFAULT_MODEL_TIER }
                  : {}),
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
      editVersionsRef.current.set(
        featureId,
        (editVersionsRef.current.get(featureId) ?? 0) + 1
      );
      // Functional update so several changes in one tick all merge.
      setPermissions((prev) => {
        const current = prev.get(featureId) ?? getPermission(featureId);
        return new Map(prev).set(featureId, { ...current, ...updates });
      });
      setUnsavedChanges((prev) => new Set(prev).add(featureId));
    },
    [getPermission]
  );

  const graduated = useMemo(
    () =>
      new Set(
        [...stored.values()]
          .filter((p) => p.graduated === true)
          .map((p) => p.featureId)
      ) as ReadonlySet<GlobalFeature>,
    [stored]
  );

  /** Drop unsaved edits to these features, back to their stored state. */
  const discardChanges = useCallback((featureIds: readonly GlobalFeature[]) => {
    setPermissions((prev) => {
      const next = new Map(prev);
      for (const id of featureIds) {
        const original = storedRef.current.get(id);
        if (original) next.set(id, original);
        else next.delete(id);
      }
      return next;
    });
    setUnsavedChanges((prev) => {
      const next = new Set(prev);
      for (const id of featureIds) next.delete(id);
      return next;
    });
  }, []);

  const savePermission = async (
    featureId: GlobalFeature,
    extra?: Partial<GlobalFeaturePermission>,
    successText?: string
  ): Promise<boolean> => {
    try {
      setSaving((prev) => new Set(prev).add(featureId));
      const versionAtSave = editVersionsRef.current.get(featureId) ?? 0;
      const permission = { ...getPermission(featureId), ...extra };
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

      storedRef.current = new Map(storedRef.current).set(featureId, permission);
      setStored(storedRef.current);
      // An edit made during the save stays in state and stays unsaved.
      if ((editVersionsRef.current.get(featureId) ?? 0) === versionAtSave) {
        setPermissions((prev) => new Map(prev).set(featureId, permission));
        setUnsavedChanges((prev) => {
          const next = new Set(prev);
          next.delete(featureId);
          return next;
        });
      } else if (extra) {
        setPermissions((prev) => {
          const cur = prev.get(featureId);
          return cur
            ? new Map(prev).set(featureId, { ...cur, ...extra })
            : prev;
        });
      }
      if (successText !== '')
        showMessage(
          'success',
          successText ?? `Saved ${FEATURE_DEFAULTS[featureId].label}`
        );
      return true;
    } catch (error) {
      console.error('Error saving permission:', error);
      showMessage(
        'error',
        `Failed to save ${FEATURE_DEFAULTS[featureId].label}`
      );
      return false;
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
    showMessage,
    getPermission,
    isSaved,
    updatePermission,
    savePermission,
    graduated,
    discardChanges,
  };
};

export type GlobalPermissionsEditor = ReturnType<
  typeof useGlobalPermissionsEditor
>;
