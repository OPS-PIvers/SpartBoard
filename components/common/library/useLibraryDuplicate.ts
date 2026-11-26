import { useBusyIdSet } from '@/hooks/useBusyIdSet';
import type { DashboardContextValue } from '@/context/DashboardContextValue';

export interface UseLibraryDuplicateOptions<T> {
  /** Kind hook that writes the copy (titled with `suggestDuplicateTitle`) and returns it. */
  duplicate: (item: T) => Promise<{ title: string }>;
  addToast: DashboardContextValue['addToast'];
  /** Success toast; defaults to `Duplicated as "<title>".` */
  successMessage?: (copyTitle: string) => string;
  /** Fixed error toast; defaults to the thrown error's message. */
  errorMessage?: string;
  onError?: (err: unknown, item: T) => void;
}

/** The one Duplicate runner for every library kind: rapid-click guard plus the shared toasts. */
export function useLibraryDuplicate<T extends { id: string }>({
  duplicate,
  addToast,
  successMessage,
  errorMessage,
  onError,
}: UseLibraryDuplicateOptions<T>) {
  const busy = useBusyIdSet();
  const run = (item: T): Promise<void> =>
    busy
      .run(item.id, async () => {
        try {
          const copy = await duplicate(item);
          addToast(
            successMessage?.(copy.title) ?? `Duplicated as "${copy.title}".`,
            'success'
          );
        } catch (err) {
          onError?.(err, item);
          addToast(
            errorMessage ??
              (err instanceof Error ? err.message : 'Duplicate failed'),
            'error'
          );
        }
      })
      .then(() => undefined);
  return { duplicate: run, isDuplicating: busy.isBusy };
}
