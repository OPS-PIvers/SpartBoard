import { useContext, useSyncExternalStore } from 'react';
import { DashboardCanvasStoreContext } from '@/context/dashboardCanvasStore';
import { useIsMobile } from '@/hooks/useIsMobile';

const noopSubscribe = () => () => undefined;

/** False at phone width or with no board open, where a tour has nothing to point at. */
export function useCanRunLiveTour(): boolean {
  const isMobile = useIsMobile();
  const store = useContext(DashboardCanvasStoreContext);
  const onBoard = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => !!store?.getState().activeDashboard
  );
  return onBoard && !isMobile;
}
