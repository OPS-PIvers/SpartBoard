import { createContext } from 'react';

export interface ViewAsContextValue {
  sid: string;
  targetUid: string;
  targetEmail: string;
  adminTarget: boolean;
  /** Epoch ms. */
  expiresAt: number;
  readOnly: boolean;
  /** The server allows unlocking edits for this session. */
  canUnlock: boolean;
  renew: () => Promise<void>;
  /** Unlock edits with an audited reason; refused for admin targets. */
  unlock: (reason: string) => Promise<void>;
  /** Ends the session, signs the tab out and closes it. */
  end: () => Promise<void>;
}

export const ViewAsContext = createContext<ViewAsContextValue | null>(null);
