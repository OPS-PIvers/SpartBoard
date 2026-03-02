import { useState, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '../config/firebase';
import { FeaturePermission, WidgetType, InternalToolType } from '../types';

export const useFeaturePermissions = () => {
  const [loading] = useState(!isAuthBypass);

  const getPermission = useCallback(
    async (widgetType: WidgetType | InternalToolType) => {
      if (isAuthBypass) return null;
      const docRef = doc(db, 'feature_permissions', widgetType);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as FeaturePermission;
      }
      return null;
    },
    []
  );

  const subscribeToPermission = useCallback(
    (
      widgetType: WidgetType | InternalToolType,
      callback: (perm: FeaturePermission | null) => void
    ) => {
      if (isAuthBypass) {
        callback(null);
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return () => {};
      }
      const docRef = doc(db, 'feature_permissions', widgetType);
      return onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          callback(snap.data() as FeaturePermission);
        } else {
          callback(null);
        }
      });
    },
    []
  );

  return {
    getPermission,
    subscribeToPermission,
    loading,
  };
};
