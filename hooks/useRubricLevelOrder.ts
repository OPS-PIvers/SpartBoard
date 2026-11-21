// The teacher's rubric level order (saved to their profile), with a local fallback outside AuthContext.
import { useContext, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import type { RubricLevelOrder } from '@/types';

export const useRubricLevelOrder = (): [RubricLevelOrder, () => void] => {
  const auth = useContext(AuthContext);
  const [localOrder, setLocalOrder] = useState<RubricLevelOrder>('high-first');
  const order = auth?.rubricLevelOrder ?? localOrder;
  const switchOrder = () => {
    const next: RubricLevelOrder =
      order === 'high-first' ? 'low-first' : 'high-first';
    if (auth) {
      auth.updateAccountPreferences({ rubricLevelOrder: next }).catch(() => {
        // Kept for this session even if the profile write fails.
      });
    } else {
      setLocalOrder(next);
    }
  };
  return [order, switchOrder];
};
