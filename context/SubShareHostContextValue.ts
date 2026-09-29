import { createContext, useContext } from 'react';

/** The teacher who shared the board, set only inside the `/subs` portal. */
export interface SubShareHostValue {
  /** The teacher's display name as recorded on the share, if any. */
  teacherName: string | null;
}

export const SubShareHostContext = createContext<SubShareHostValue | null>(
  null
);

/** Null outside a sub share, so a widget keeps using the signed-in user. */
export function useSubShareHost(): SubShareHostValue | null {
  return useContext(SubShareHostContext);
}
