import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { CarRiderProGlobalConfig } from '@/types';

export const useCarRiderProConfig = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'feature_permissions', 'car-rider-pro'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as {
            config?: CarRiderProGlobalConfig;
            url?: string;
          };
          // Prefer config.url (new shape); fall back to top-level url (legacy shape)
          const resolved = data.config?.url ?? data.url ?? '';
          setUrl(resolved);
        } else {
          setUrl('');
        }
        setIsLoading(false);
      },
      (error) => {
        console.error(
          'Failed to listen for Car Rider Pro config changes:',
          error
        );
        setIsLoading(false);
        setUrl('');
      }
    );
    return () => unsubscribe();
  }, []);

  return { url, isLoading };
};
