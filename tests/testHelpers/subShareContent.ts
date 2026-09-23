import type { SubShareContentValue } from '@/context/SubShareContentContextValue';

/** A share whose answer keys were never bundled, for suites that test content. */
export const noSubShareKey: SubShareContentValue['loadKey'] = () =>
  Promise.resolve({ payload: null, denied: false });
