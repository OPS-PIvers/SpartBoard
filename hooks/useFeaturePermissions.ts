import { useState, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '../config/firebase';
import { FeaturePermission, WidgetType, InternalToolType } from '../types';

export const useFeaturePermissions = () => {
  const [loading, setLoading] = useState(false);

  const getPermission = useCallback(
    async (widgetType: WidgetType | InternalToolType) => {
      if (isAuthBypass) {
        setLoading(false);
        return null;
      }
      setLoading(true);
      try {
        const docRef = doc(db, 'feature_permissions', widgetType);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          return snap.data() as FeaturePermission;
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const subscribeToPermission = useCallback(
    (
      widgetType: WidgetType | InternalToolType,
      callback: (perm: FeaturePermission | null) => void
    ) => {
      if (isAuthBypass) {
        setLoading(false);
        callback(null);
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return () => {};
      }

      setLoading(true);
      const docRef = doc(db, 'feature_permissions', widgetType);
      return onSnapshot(
        docRef,
        (snap) => {
          setLoading(false);
          if (snap.exists()) {
            callback(snap.data() as FeaturePermission);
          } else {
            callback(null);
          }
        },
        (error) => {
          console.error(
            `Error subscribing to feature permission "${widgetType}":`,
            error
          );
          setLoading(false);
          callback(null);
        }
      );
    },
    []
  );

  return {
    getPermission,
    subscribeToPermission,
    loading,
  };
};
